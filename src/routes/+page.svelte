<h1>query.live repro</h1>

<p>
	Two routes, sharing the same in-memory counter and the same
	<code>watchCounter</code> + <code>bump</code> remote functions:
</p>

<ul>
	<li>
		<a href="/broken">/broken</a> — no proxy hint set; nginx buffers the
		stream and the page sits in <code>disconnected</code>.
	</li>
	<li>
		<a href="/fixed">/fixed</a> — <code>X-Accel-Buffering: no</code> is set
		on the response by <code>hooks.server.ts</code> for this route, so nginx
		streams the response through and live updates arrive.
	</li>
</ul>

<p>
	Open both routes in two tabs side-by-side. <code>/fixed</code> ticks live;
	<code>/broken</code> doesn't, even when the bump comes from the other tab.
</p>
