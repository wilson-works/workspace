# 2. One office for all your devices (Tailscale)

About 20 minutes, plus a few minutes per extra computer. Optional: with one computer and no phone
you can skip this guide.

When you finish:

- your **phone** opens the office from anywhere and buzzes when a session asks you a question;
- your **other computers** (a laptop, a mini PC that runs long jobs) show their sessions on the same
  floor, with a chip per machine;
- a note you write on one device reaches a session on another.

## How it fits together

**Tailscale** puts your devices on a small private network of their own, called a **tailnet**. Only
devices signed in to your Tailscale account are on it. Nothing is opened to the internet.

```
   phone ──────┐
               │  https://<hub>.<tailnet>.ts.net   (tailscale serve, tailnet only)
   laptop ─────┼──────────────►  HUB computer  ──►  office on 127.0.0.1:4316
               │                     ▲
   mini PC ────┘   every 15 s each   │  notes for its sessions ride back
                   spoke POSTs its   │  in the answer
                   floor to the hub ─┘
```

- One computer is the **hub**: the one that is on the most. It keeps the group chat and answers the
  phone. Every other computer is a **spoke**. A spoke opens no port; it only sends.
- The office itself only ever listens on 127.0.0.1 (this computer). `tailscale serve` is what passes
  tailnet traffic to it, over HTTPS, and stamps who sent it. The office refuses any page request
  whose address it was not told about, and any spoke feed that did not come through the tailnet.

## 1. Install Tailscale everywhere

On every computer and on your phone: install from https://tailscale.com/download and **sign in with
the same account** on each one. (Windows, macOS, Linux, iPhone and Android are all supported.)

Check: the admin console at https://login.tailscale.com/admin/machines lists every device.

## 2. Turn on MagicDNS and HTTPS (once, in the admin console)

Open https://login.tailscale.com/admin/dns.

- **MagicDNS** gives each device a name like `desk.tail1234.ts.net`. It is on by default for new
  tailnets; turn it on if it isn't.
- **HTTPS Certificates**: turn it on. The phone needs HTTPS for notifications.

Your tailnet's name (the `tail1234.ts.net` part) is shown on that page.

## 3. Put the hub on the tailnet

On the hub computer, in a terminal:

```
tailscale serve --bg 4316
```

On Windows, if `tailscale` isn't found, use `"C:\Program Files\Tailscale\tailscale.exe" serve --bg 4316`.
On macOS with the app from the App Store or tailscale.com, the command line is
`/Applications/Tailscale.app/Contents/MacOS/Tailscale`.

It prints the address, for example `https://desk.tail1234.ts.net/`. `--bg` keeps it running across
restarts. Check it any time with `tailscale serve status`; stop it with `tailscale serve reset`.

Then restart the office so it learns its tailnet name (it looks it up itself):

```
node bin/office-start.js --restart
```

Or ask Claude: *"Walk me through guides/02-tailscale.md step 3 on this computer and check each
command worked."*

## 4. Tell WorkSpace about your machines

Every computer gets the **same** `machines` list and `hub_url` in its own `workspace.config.json`.
Say "set up my WorkSpace" on each, or edit the file:

```json
"machines": [
  { "name": "DESK",   "computer": "DESKTOP-4F2K9QX", "hub": true },
  { "name": "LAPTOP", "computer": "SAMS-LAPTOP" },
  { "name": "MINI",   "computer": "MINI-PC" }
],
"hub_url": "https://desk.tail1234.ts.net"
```

- `name` is what the office shows on the machine's chip.
- `computer` is that computer's own name: `COMPUTERNAME` on Windows (`echo %COMPUTERNAME%`), the
  `hostname` command on macOS and Linux. It is how each computer knows which entry it is.
- Exactly one machine has `"hub": true`.
- Each machine gets its own pool of session names: the first trees (Cedar, Aspen...), the second
  stars (Vega, Rigel...), the third rivers. Set `"callsigns": "stars"` on a machine to choose.

Restart the office on every computer after changing the list: `node bin/office-start.js --restart`.

## 5. Set up each spoke

On each other computer: install the prerequisites and clone WorkSpace ([guide 1](01-install.md)),
copy in the same `machines` and `hub_url`, then:

```
node bin/install.js hooks --apply
node bin/install.js startup --apply
node bin/office-start.js
```

The office on a spoke starts a small **forwarder** next to itself. Within about 15 seconds the
spoke's chip on the hub's office turns green and its sessions appear. If it doesn't, read
`forward.log` in the spoke's office folder (guide 1, "Where things live"): it says why in one line.

## 6. Your phone

1. Make sure the Tailscale app on the phone is connected.
2. Open the hub's address (`https://desk.tail1234.ts.net`) in Safari or Chrome.
3. **iPhone**: tap Share, then **Add to Home Screen**, and open the office from that icon. Apple only
   allows web notifications from a Home Screen app. **Android**: Chrome works as it is; adding it to
   the Home Screen is optional.
4. Tap the **bell** in the bar and allow notifications. A test buzz arrives.

You get one buzz per new question, and nothing else. Questions that arrive within two minutes of
each other come together. The message is encrypted to your phone, so Apple or Google carry only
ciphertext.

## Keeping it private

- Anyone on your tailnet who can reach the hub can see the office and send notes to your sessions.
  On a personal tailnet that is only you. If other people share your tailnet (a company account),
  add an access rule so only your own devices can reach the hub. Ask Claude to help you write one
  from Tailscale's guide: https://tailscale.com/kb/1018/acls
- Sessions under your `privacy.private_work` folders never send their titles or tasks to the hub or
  the phone; the hub checks again and drops them if a spoke ever sent one.
- A spoke must be a device signed in as you (a normal device), not a tagged server: Tailscale only
  stamps who sent a request for devices that belong to a person, and the hub refuses a feed that
  carries no sender.

## If something's off

| What you see | What to do |
|---|---|
| The phone gets "unknown host" | The office started before Tailscale was up. `node bin/office-start.js --restart` on the hub. |
| `tailscale serve` says HTTPS is not enabled | Step 2: turn on HTTPS Certificates in the admin console. |
| A spoke's chip says "not linked yet" | On the spoke, check `hub_url` and read `forward.log`. "unknown machine" means its `computer` doesn't match an entry in the hub's `machines` list. |
| A spoke's chip says "stopped reporting" | The spoke is off or asleep, or its office isn't running. Its sessions come back when it does. |
| Notes to a spoke's session never arrive | That chat isn't running the hooks: `node bin/install.js hooks --apply` on the spoke, then reopen the chat. |
| No buzz on the iPhone | Open the office from the Home Screen icon, not from Safari, and tap the bell there. |
