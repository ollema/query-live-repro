import * as v from 'valibot';
import { query, command } from '$app/server';
import { counterEvents, getCounter } from '$lib/server/events';

export const watchCounter = query.live(v.object({}), async function* () {
	let pending = false;
	let wake: (() => void) | undefined;

	const unsubscribe = counterEvents.subscribe(() => {
		pending = true;
		wake?.();
		wake = undefined;
	});

	try {
		yield { value: getCounter(), at: new Date().toISOString() };

		while (true) {
			if (!pending) {
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
			pending = false;
			yield { value: getCounter(), at: new Date().toISOString() };
		}
	} finally {
		unsubscribe();
	}
});

export const bump = command(v.object({}), async () => {
	counterEvents.bump();
	watchCounter({}).reconnect();
});
