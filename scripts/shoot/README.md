Scenario files for `node scripts/shoot.mjs`. Each `*.mjs` default-exports

    export default async function ({ page, size, shot, settle }) { … await shot('gallery-detail'); }

`size` is 'phone' | 'desktop'. Keep them tolerant: wrap optional steps in try/catch so one missing selector never blocks the rest.
