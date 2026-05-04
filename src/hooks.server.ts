import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Tell upstream proxies (notably nginx) not to buffer streaming responses
	// from remote functions. Without this, query.live ndjson never reaches the
	// client because nginx holds the entire response until proxy_read_timeout.
	//
	// Note: for a remote function request like
	// `GET /_app/remote/<hash>/watchCounter`, `event.url.pathname` here is set
	// to the *originating page* path (`/fixed`), NOT the remote endpoint path.
	// SvelteKit reads this from the `x-sveltekit-pathname` request header. So
	// the obvious `pathname.startsWith('/_app/remote/')` filter never matches.
	// We use this to scope the workaround to the `/fixed` route only.
	if (event.url.pathname === '/fixed') {
		response.headers.set('X-Accel-Buffering', 'no');
	}

	return response;
};
