# site

hyper-minimal, text-first personal site. plain markdown in, static html out.
no frameworks, no npm dependencies — `build.js` is the entire build step.

## structure

```
content/             ← you write here
  home.md            ← homepage content
  blog/
    devlogs/*.md
    talks/*.md
    tutorial/*.md
  journal/*.md
  notes/*.md
  poems/*.md
layout/
  template.html       ← single shared page shell (sidebar, header, footer)
style.css             ← copied through untouched
build.js              ← reads content/, writes dist/
dist/                 ← generated output — never edit by hand, gets wiped on every build
.github/workflows/deploy.yml   ← auto-builds + deploys to GitHub Pages on push
```

## writing a new post

1. create a markdown file in the right folder:
   - `content/blog/devlogs/your-post.md` (or `talks/`, `tutorial/`)
   - `content/journal/your-entry.md`
   - `content/notes/your-note.md`
   - `content/poems/your-poem.md`

2. add frontmatter at the top:

   ```
   ---
   title: your post title
   description: one line for the meta tag
   date: 28 jun 2026
   category: devlogs
   ---

   your content starts here, plain markdown.
   ```

   `date` is optional — if you leave it out, only the category shows in the meta line.

3. run the build:

   ```
   node build.js
   ```

4. that's it. the sidebar is generated automatically from whatever files
   exist in `content/` — you never edit a sidebar by hand again.

## markdown support

intentionally small, covers exactly what this site needs:

- `# / ## / ###` headings
- paragraphs (blank line = new paragraph)
- **a single line break inside a paragraph becomes `<br>`** — useful for
  poems, but means you should NOT soft-wrap a normal prose paragraph
  across multiple lines in the source unless you want a visible line
  break. write each paragraph as one long line.
- `**bold**`, `*italic*`, `` `inline code` ``
- `[link text](url)`, `![alt](src)`
- fenced code blocks with triple backticks
- `> blockquote`
- `- ` bullet lists
- `---` horizontal rule

nothing else (no tables, no nested lists, no ordered lists). if you need
more, extend `markdownToHtml()` in `build.js` — it's about 100 lines and
deliberately simple.

## homepage

`content/home.md` uses a few extra single-line block markers that the
homepage needs but posts don't:

```
LINKROW resume|resume.pdf github|https://github.com/you x dot com|https://x.com/you

PROJECTCARD title|description|image.png|link
PROJECTCARD another title|another description|image2.png|link2

AVATARROW https://github.com/friend.png|https://github.com/friend ...

WEBRING label text: name|link prev|link next|link
```

each `label|href` pair is one token; separate tokens with spaces. labels
can contain spaces too ("x dot com" is a single label) as long as the
href itself has no spaces.

## local preview

```
node build.js
cd dist
python3 -m http.server 8000
```

then open `http://localhost:8000`. (opening `dist/index.html` directly
via `file://` won't work — relative paths still need an actual server,
same as before.)

## deploying

push to `main`. the github actions workflow in `.github/workflows/deploy.yml`
runs `node build.js` and publishes `dist/` to github pages automatically —
you never touch `dist/` or run the build yourself for a real deploy.

one-time setup: in your repo settings → Pages → set "build and deployment
source" to **GitHub Actions** (not "deploy from a branch").

## adding a brand new top-level page (art.html, projects.html, etc.)

these aren't generated yet — they're still placeholder links in
`layout/template.html`. to add one for real, either:

- extend `build.js` with a small renderer for it (similar to `renderHome()`), or
- for something simple and rarely-updated, just hand-write a static html
  file directly into `dist/` after each build — though it'll get wiped
  next build, so this only makes sense for a true one-off.
