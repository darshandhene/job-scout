# Brief

Brief is a personal job watch. You write down the roles you want. Once a day it reads the newest postings and tells you when something fits.

It is a daily net for fresh listings, not a search of every job on the internet. Each match opens the original posting.

Run it locally at [http://127.0.0.1:4317](http://127.0.0.1:4317).

## Features

- Watches for the roles you name, with optional location, exclusions, remote-only, visa sponsorship, and entry-level or class-of-2027 filters.
- A data-role starter for data analyst, data scientist, data engineer, analytics engineer, and business intelligence roles, with sponsorship and new-grad filters on.
- Reads [LinkedIn](https://www.linkedin.com/jobs), [Jobright](https://jobright.ai) new-grad and H-1B lists, [Himalayas](https://himalayas.app), [Remote OK](https://remoteok.com), [Jobicy](https://jobicy.com), [Arbeitnow](https://www.arbeitnow.com), and [Remotive](https://remotive.com).
- Daily check at the hour you choose, plus **Check the boards** whenever you want a pass now.
- In-app matches, a notification history, desktop alerts, and Slack, Discord, or [ntfy](https://ntfy.sh) delivery.
- Save, apply, or dismiss a role. Saved and applied roles stay. Dismissed ones leave the main list.
- Watches, matches, and notices stay in `data/brief.json` on this machine. Nothing is sent anywhere unless you add a webhook.

## How to run

Requires Node.js.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

The dev server listens on port **4317**. On another machine on the same network, use this computer’s address with that port.

Stop the server with Ctrl+C in the terminal where it is running.

To run the production build:

```bash
npm run build
npm start
```

That serves the same URL, [http://127.0.0.1:4317](http://127.0.0.1:4317).

Tests:

```bash
npm test
```

## How it works

1. You save a watch: role titles, and any limits you want.
2. While Brief is open, a scheduler checks once a minute whether the daily hour has arrived. If the app was asleep at that hour, it catches up the next time it starts.
3. A pass reads the boards. LinkedIn is searched for your titles. Sponsorship also uses a visa-sponsorship search. Entry level uses LinkedIn’s entry-level filter and Jobright’s new-grad lists. Jobright’s H-1B list counts as sponsorship. The other boards are public feeds.
4. Board data is reused for about six hours so the sources are not polled more often than they allow. Listings older than about three weeks are left out.
5. A role matches a watch when the title contains one of your role phrases as whole words, and it passes that watch’s location, exclusion, remote, sponsorship, and new-grad rules. Senior, staff, and director titles are left out of new-grad watches.
6. Location can list several places, separated by commas. **United States** also matches US cities and states. Leave location blank to include roles with no city.
7. New matches are stored, shown on the desk, and written to the notification bell. If desktop alerts are on, the browser notifies you while the tab is open. If a webhook is set, Brief posts the same news there.
8. One pass keeps up to 15 new roles per watch and 40 new roles overall. Saved and applied roles are kept. Other roles are trimmed to the newest 200. The bell keeps the latest 60 notices.

## User guide

### Start a watch

On the desk, use **Start a watch**.

- **Roles.** The titles you want, separated by commas. Example: `product designer, brand designer`.
- **Watch name.** Optional. If you leave it blank, Brief uses the role text.
- Shortcuts fill common sets: Product designer, Frontend engineer, Account executive, and **Data roles, 2027, sponsored**.
- **Location.** Optional cities or regions. Commas mean either place.
- **Skip roles that mention.** Words that knock a posting out, such as `intern, unpaid`.
- **Remote only.** Skips roles that need an office.
- **Visa sponsorship.** **Any role**, or **Only roles that sponsor**. Sponsored means the posting says so, LinkedIn was searched for visa sponsorship, or Jobright marked it as an H-1B role.
- **New grad only.** Keeps new-graduate, entry-level, and class-of-2027 titles.

Press **Watch for these roles**. Brief reads the boards for that watch right away.

Watches are listed on the left. Turn one off, edit it, or delete it from that list. Turning a watch off stops new matches for it. Deleting it drops its unsaved matches.

### Read matches

New roles appear in the center. A card shows the title, company, location, source, and badges such as Remote, New grad, or Sponsors.

- **Open role** goes to the original posting.
- **Save** keeps the role.
- **Applied** moves it to the Applied list.
- **Dismiss** hides it from the main list.

Filter the list with New, Saved, Applied, All, and Dismissed. All hides dismissed roles. Saved and applied roles stay even if you later delete the watch that found them.

### Check the boards

**Check the boards** runs a pass immediately. The header shows when the next scheduled pass is due, and whether the boards have been read.

### Delivery

Open the gear icon for **Delivery**.

- **Every day at.** Hour, minute (`:00`, `:15`, `:30`, or `:45`), and timezone. The daily pass runs only while Brief is open. If it missed that time, it runs on the next start.
- **Desktop alerts.** The browser asks for permission, then shows a notification when a new match arrives while the tab is open.
- **Phone, Slack, or Discord.** Paste a Slack or Discord incoming webhook, or an ntfy topic such as `https://ntfy.sh/your-private-topic`. Use a topic that is not easy to guess. **Send a test** before relying on it.

The bell keeps a short history of match notices. Mark them read from that panel.
