import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Diagnostic: prove the hook ran (and which path it ran for) by always
	// setting these on every response.
	response.headers.set('X-Repro-Hooks', 'ran');
	response.headers.set('X-Repro-Path', event.url.pathname);

	// The actual workaround: ask upstream proxies (notably nginx) not to
	// buffer streaming responses from remote functions. Drop the path filter
	// for now so we can confirm whether the header survives at all.
	response.headers.set('X-Accel-Buffering', 'no');

	return response;
};
