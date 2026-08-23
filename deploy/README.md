# DTA deployment
The primary company deployment is the self-contained Docker image plus the hardened Kubernetes examples in [`deploy/kubernetes`](./kubernetes/).

Release images are published for `linux/amd64` and `linux/arm64` at `ghcr.io/yhwangtw/dta`. The company can mirror a verified digest into its internal registry, then replace only the image reference, ConfigMap, Secret references, mounted Agent manifest, and storage bindings.

- Architecture and production limitations: [`docs/architecture.md`](../docs/architecture.md)
- Build-once/runtime-configuration guide: [`docs/deployment.md`](../docs/deployment.md)
- Local environment template: [`.env.example`](../.env.example)

For a non-container host, build once with `npm ci && npm run build`, then adapt the included systemd or launchd example. Run DTA as an unprivileged user and keep its data directory writable. Company production should prefer the image so Node.js, Next.js, Pi, Git, and FFmpeg versions remain controlled by CI.
