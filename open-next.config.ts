// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// Disable the workerd export condition so esbuild resolves packages via
// the node platform defaults. Without this, @sentry/nextjs resolves to its
// edge CJS build (./build/cjs/edge/index.js) which nft does not trace/copy.
export default {
	...defineCloudflareConfig({
		// For best results consider enabling R2 caching
		// See https://opennext.js.org/cloudflare/caching for more details
		// incrementalCache: r2IncrementalCache
	}),
	cloudflare: { useWorkerdCondition: false },
};
