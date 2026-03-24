# Pletra

A modern web client for [Trakt](https://trakt.tv), deployed with [Vinext](https://github.com/cloudflare/vinext).

_Disclaimer: This project is entirely AI-generated. It is not affiliated with / endorsed by Trakt - it is an independent implementation using the Trakt API._

## Features

- Dashboard with continue watching, start watching, recently watched, and friend activity sections.
- Full show, movie, episode, season, and person pages with ratings, cast, and comments.
- User profiles with watch history, ratings, and lists (with sorting, filtering, and search).
- Search palette (Cmd+P) for quick navigation.
- Calendar view for upcoming episodes.
- Explore pages for trending, popular, most watched, and anticipated content.
- Rate, mark watched, and manage your watchlist.
- Settings stored in `localStorage`.
- Trakt credentials securely stored in encrypted cookies via Better Auth.

## Contributing

### Setup

```sh
cp .env.example .env.local
```

Fill in the required environment variables:

- `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET` - from [Trakt API](https://trakt.tv/oauth/applications)
- `TMDB_API_KEY` - from [TMDB](https://www.themoviedb.org/settings/api)
- `BETTER_AUTH_SECRET` - any random string for session encryption

### Development

```sh
vp install
vp run dev
```

### Build

```sh
vp run build
vp run start
```

### Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- [Vinext](https://github.com/cloudflare/vinext) (deployment)
- [Tailwind CSS](https://tailwindcss.com)
- [Trakt API](https://trakt.docs.apiary.io)
- [TMDB API](https://developer.themoviedb.org) (images)
- [Better Auth](https://better-auth.com) (OAuth sessions via cookies)
- [Vite+](https://viteplus.dev) (toolchain)
