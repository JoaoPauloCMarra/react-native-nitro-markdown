# Third-party notices

`react-native-nitro-markdown` includes source code from the projects below.

## md4c

`cpp/nitromd/nitromd.c` and `cpp/nitromd/nitromd.h` are a fork of
[md4c](https://github.com/mity/md4c) by Martin Mitáš. The MIT licence text is
in the header of both files. See `cpp/nitromd/UPSTREAM.md`.

## enriched-markdown

`cpp/core/StreamText.*`, `cpp/core/StreamBoundary.*` and
`cpp/core/StreamFilter.*` are ported from
[enriched-markdown](https://github.com/software-mansion/enriched-markdown)
(`packages/core/cpp/parser`, commit
`5bcfe94d0e06d15f810e34a14f3544698ab40488`), with the changes named in each
file header.

`cpp/repair/*` is copied from the same commit (`packages/core/cpp/repair`).
The only change is the root namespace, `Markdown` to `NitroMarkdownRepair`,
named in each file header.

```
MIT License

Copyright (c) 2025 Software Mansion
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## remend

`cpp/repair/*` is a C++ port of
[remend](https://github.com/vercel/streamdown/tree/main/packages/remend) 1.3.1
by Vercel, made by the enriched-markdown authors. It is a changed version of
remend: the differences are listed in the header of
`cpp/repair/MarkdownRepair.hpp`. remend is licensed under the Apache License,
Version 2.0. The full licence text is in `cpp/repair/LICENSE-APACHE-2.0.txt`.

```
Copyright 2023 Vercel, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
