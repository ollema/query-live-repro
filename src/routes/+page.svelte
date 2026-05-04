<script lang="ts">
	import { watchCounter, bump } from '$lib/api/counter.remote';

	let live = $derived(watchCounter({}));
	let data = $derived(await live);
</script>

<h1>query.live repro</h1>

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
