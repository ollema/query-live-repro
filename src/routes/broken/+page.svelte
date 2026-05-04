<script lang="ts">
	import { watchCounter, bump } from '$lib/api/counter.remote';

	let live = $derived(watchCounter({}));
	let data = $derived(await live);
</script>

<h1>/broken</h1>

<p>
	No <code>X-Accel-Buffering: no</code> set on the response. nginx buffers the
	ndjson stream until <code>proxy_read_timeout</code>, the framework treats
	it as a disconnect, and live updates never arrive.
</p>

<p>counter: <strong>{data.value}</strong></p>
<p>last yield: <code>{data.at}</code></p>

<p>
	<button onclick={() => bump({})}>bump</button>
</p>

{#if live.connected}
	<p style="color: green">connected</p>
{:else}
	<p style="color: red">
		disconnected — <button onclick={() => live.reconnect()}>retry</button>
	</p>
{/if}

<p><a href="/">← back</a> · <a href="/fixed">go to /fixed</a></p>
