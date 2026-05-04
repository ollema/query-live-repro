<script lang="ts">
	import { watchCounter, bump } from '$lib/api/counter.remote';

	let live = $derived(watchCounter({}));
	let data = $derived(await live);
</script>

<h1>/fixed</h1>

<p>
	<code>X-Accel-Buffering: no</code> is set on the response from
	<code>hooks.server.ts</code> for this route. nginx streams the ndjson
	through and live updates arrive immediately.
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

<p><a href="/">← back</a> · <a href="/broken">go to /broken</a></p>
