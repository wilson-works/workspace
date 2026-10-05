---
id: {{id}}
title: {{title}}
for: {{for}}
status: backlog
filed_by: {{by}}
created: {{created}}
repo: {{repo}}
branch:
---
<!-- A work order: one piece of work that can be merged on its own. `fleet board --add` fills in the
     top; the folder it sits in (backlog, doing, done, archive) is its status. -->

# {{title}}

## Goal

What should exist when this is done, in plain words.

## Context

The repo, the files, earlier work orders, anything the builder needs to know. Name paths; never
paste private content.

## How to check it

- [ ] A check anyone can run or see: a command and what it prints, or a page and what it shows.
- [ ] The branch is pushed. Nothing was merged by the builder.

## Result

The builder fills this in when it finishes: what was done, what was not, the branch, and how to
check it, step by step.
