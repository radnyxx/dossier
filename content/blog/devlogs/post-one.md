---
title: rebuilding the sidebar in zig
description: notes on porting the site's nav tree to a static zig build
date: 26 jun 2026
category: devlogs
---

spent the weekend ripping out the old nav and replacing it with something i actually understand end to end. no frameworks, no build step for the *site* itself, just html and a stylesheet.

## why bother

the old version worked fine but every time i wanted to add a post i had to remember three different places to update it. that's a bug waiting to happen, so i flattened it down to one convention: write a markdown file, run the build, done.

```
content/blog/devlogs/post-one.md
content/blog/devlogs/post-two.md
content/journal/entry-one.md
```

that's the whole system. no manual sidebar editing anymore — the build script walks the content folder and generates it.

> simple things should stay simple, even when you're tempted to add tooling for it.

more on the actual zig rewrite in the next devlog.
