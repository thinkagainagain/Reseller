# How to Create a Git Repo and Push it to GitHub

A step-by-step guide for turning a local folder into a Git repository and
publishing it to GitHub. Written from the steps used to set up this repo.

## Prerequisites

- **Git for Windows** installed (check with `git --version` in a terminal).
- A **GitHub account** and a way to reach github.com in a browser.
- A terminal open in the folder you want to turn into a repo.

## 1. Check Git is installed

```bash
git --version
```

If this errors, install Git for Windows from https://git-scm.com/download/win
and re-open your terminal.

## 2. Initialize the repository

Run this inside the project folder (the folder itself, not a parent or
child folder):

```bash
git init
```

This creates a hidden `.git` folder that turns the directory into a Git
repository. Confirm it worked with:

```bash
git status
```

You should see `On branch master` (or `main`) and `No commits yet`.

## 3. Add starter files

At minimum, most repos start with:

- **README.md** — describes the project.
- **.gitignore** — tells Git which files/folders to never track (build
  output, secrets, editor junk, dependency folders like `node_modules/`).

Create these with a text editor, or ask Claude to generate them for you.

## 4. Stage your files

"Staging" means marking files as ready to be included in the next commit.

```bash
git add README.md .gitignore
```

To stage everything in the folder instead of naming files one by one:

```bash
git add .
```

Check what's staged:

```bash
git status
```

## 5. Commit

A commit is a saved snapshot of the staged files, with a message describing
the change.

```bash
git commit -m "Initial commit"
```

## 6. Name your default branch `main`

Modern GitHub repos default to a branch named `main` rather than the older
`master`. If your repo initialized as `master`, rename it:

```bash
git branch -m master main
```

## 7. Create the repository on GitHub

This step happens in your browser, not the terminal:

1. Go to https://github.com/new
2. Enter a repository name.
3. Choose **Public** or **Private**.
4. Do **not** initialize with a README, .gitignore, or license if you
   already created these locally — that avoids a conflict when you push.
5. Click **Create repository**. GitHub shows you the repo's URL, e.g.
   `https://github.com/<your-username>/<repo-name>.git`

## 8. Link your local repo to GitHub

Tell your local repo where the "remote" (GitHub) copy lives:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
```

Verify it's set correctly:

```bash
git remote -v
```

## 9. Push your commit to GitHub

```bash
git push -u origin main
```

- `-u` sets `origin/main` as the default upstream, so future pushes from
  this branch can just be `git push`.
- The first time you push, **Git Credential Manager** (bundled with Git for
  Windows) opens a browser window asking you to sign in to GitHub and
  authorize. Approve it there — you don't type a password into the
  terminal.

Once it finishes, refresh the GitHub repo page in your browser and your
files should be there.

## Everyday workflow after the first push

Once a repo is set up, day-to-day changes follow a short loop:

```bash
git status
```

```bash
git add <changed-files>
```

```bash
git commit -m "Describe what changed and why"
```

```bash
git push
```

## Quick command reference

| Command | What it does |
|---|---|
| `git init` | Turn a folder into a Git repo |
| `git status` | Show what's changed / staged |
| `git add <file>` | Stage a file for the next commit |
| `git commit -m "msg"` | Save a snapshot of staged files |
| `git branch -m master main` | Rename current branch to `main` |
| `git remote add origin <url>` | Link local repo to a GitHub repo |
| `git remote -v` | List configured remotes |
| `git push -u origin main` | Push and set upstream tracking |
| `git push` | Push again after upstream is set |
| `git log --oneline` | View commit history |
