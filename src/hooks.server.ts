import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Tell upstream proxies (notably nginx) not to buffer the streaming
	// ndjson response from query.live. Without this, nginx holds the entire
	// response until proxy_read_timeout and the client never sees a frame.
	//
	// Scoped here to the /fixed page only so /broken stays broken for
	// comparison — see README.
	if (event.url.pathname === '/fixed') {
		response.headers.set('X-Accel-Buffering', 'no');
	}

	return response;
};
