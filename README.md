# homelab-compose

Docker Compose stacks from a self-hosted homelab, published as working
examples. They are the real files that run the lab, with secrets, domains and
addresses swapped for placeholders. Nothing here is a tutorial template written
after the fact.

If you are learning Docker, start with [`apps/homepage`](apps/homepage): one
container, one network, a few labels. Then read [`apps/traefik`](apps/traefik),
because every other stack depends on it.

## Layout

The lab splits its Docker hosts by role, and so does this repo.

| Folder | Host role | What runs there |
|---|---|---|
| [`apps/`](apps) | Application server on the APPS network | User-facing apps, SSO, Git and CI, the update bot |
| [`mgmt/`](mgmt) | Management server on an isolated management network | Deployment control, admin tools, monitoring |

| Stack | What it shows |
|---|---|
| [`apps/traefik`](apps/traefik), [`mgmt/traefik`](mgmt/traefik) | Reverse proxy with wildcard TLS (Cloudflare DNS challenge) behind a Docker socket proxy |
| [`apps/authentik`](apps/authentik) | Single sign-on with its own Postgres; the OIDC provider the other apps log in through |
| [`mgmt/authentik-outpost`](mgmt/authentik-outpost) | Authentik forward-auth, so admin tools without their own login sit behind SSO |
| [`apps/gitea`](apps/gitea), [`apps/runner`](apps/runner) | Self-hosted Git and an Actions runner |
| [`mgmt/komodo`](mgmt/komodo), [`apps/komodo-periphery`](apps/komodo-periphery) | Komodo Core and its per-host agent: stacks deploy from Git |
| [`apps/renovate.json`](apps/renovate.json), [`mgmt/renovate.json`](mgmt/renovate.json) | Update policy for every image in the repo |
| [`apps/seafile`](apps/seafile) | A multi-container app: file server, MariaDB, Redis and Collabora on a private network |
| [`apps/homepage`](apps/homepage) | Dashboard; the simplest stack here |
| [`apps/mealie`](apps/mealie), [`apps/vikunja`](apps/vikunja) | Single-container apps with OIDC login |
| [`mgmt/code-server`](mgmt/code-server) | VS Code in the browser, behind forward-auth |
| [`mgmt/kasm`](mgmt/kasm) | A locked-down Chromium session for admin web UIs, plus a small helper image built from this folder |
| [`mgmt/adguardhome-sync`](mgmt/adguardhome-sync) | Pushes DNS filter rules from the home AdGuard Home to an off-site copy |
| [`mgmt/pulse`](mgmt/pulse) | Monitoring dashboard for the Proxmox hosts and Docker hosts |

## Why the stacks are built this way

- **Traefik never touches the Docker socket.** It reads container labels
  through [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy),
  which only allows read access to the container list (`CONTAINERS=1`,
  `POST=0`). A bug in the proxy-facing side of Traefik can't start or stop
  containers.
- **Nothing is exposed by default.** `exposedByDefault: false` means a
  container is only routed when its own labels say `traefik.enable=true`.
- **One stack owns each shared network.** The Traefik network (`warptunnel` on
  apps) is created by the Traefik stack with a fixed subnet; every other stack
  joins it as `external: true`, so removing an app can never take the network
  with it. On mgmt, the Komodo stack creates `mgmt` and `komodo`, because
  Komodo Core has to start before anything it deploys.
- **Databases stay on a private network.** Seafile's MariaDB and Redis, and
  Authentik's Postgres and worker, sit on a stack-only network. Only the
  containers Traefik has to reach also join the Traefik network.
- **Two kinds of access control, chosen per host.** Apps on the APPS host use
  an IP allowlist middleware (`ipallow@file`) and their own logins, mostly OIDC
  through Authentik. Admin tools on the mgmt host use Authentik forward-auth
  (`authentik@file`). Forward-auth isn't put in front of apps that already
  have a login, because two logins for one app helps no one.
- **Services that aren't containers still go through Traefik.** The file
  provider (`config/fileConfig.yml`) routes to services on another host, with
  the same TLS and middlewares as the Docker ones.
- **Every image is pinned, and a bot proposes the updates.** No stack uses
  `latest`. App images name an exact release, and databases name a major
  version line. The one deliberate exception is the Kasm
  browser, which follows a rolling daily tag so the browser itself stays
  patched. [Renovate](https://docs.renovatebot.com/) opens a pull request for
  each update. Nothing merges on its own (`"automerge": false`). Images
  wait three days after release before a PR appears. Database major versions
  follow what each app's maintainers support and are locked in
  `renovate.json`, with the reason in each rule's `description`.
  Authentication updates skip the wait and get their own review label.
- **Stacks deploy from Git.** Komodo Core (on mgmt) tells the Komodo Periphery
  agent on each host to pull and deploy a stack from its Git repo. The Komodo
  stack itself is the exception: it's deployed by hand, since it's what does
  the deploying.
- **`unless-stopped` everywhere.** A container that was stopped on purpose
  stays stopped after a reboot; everything else comes back.

## Using a stack

1. Copy the folder.
2. Copy each `*.example` env file to the name the compose file expects (for
   example `.env.example` to `.env`) and fill in every `CHANGE_ME`.
3. Replace `example.org` with your own domain, and the `10.0.x.x` addresses
   with your own networks.
4. Bring up Traefik first (it creates the shared network), then the stack:

   ```bash
   docker compose up -d
   ```

Data lives under `/opt/appdata/<stack>/` on the host. Change the volume paths
to suit yours.

## License

[MIT](LICENSE)
