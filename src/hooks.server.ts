import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Diagnostic: surface the pathname the hook saw, on every response.
	response.headers.set('X-Repro-Path', event.url.pathname);

	// The actual workaround — scoped to /fixed.
	if (event.url.pathname === '/fixed') {
		response.headers.set('X-Accel-Buffering', 'no');
	}

	return response;
};
