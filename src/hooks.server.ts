import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Tell upstream proxies (notably nginx) not to buffer streaming responses
	// from remote functions. Without this, query.live ndjson never reaches the
	// client because nginx holds the entire response until proxy_read_timeout.
	if (event.url.pathname.startsWith('/_app/remote/')) {
		response.headers.set('X-Accel-Buffering', 'no');
	}

	return response;
};
