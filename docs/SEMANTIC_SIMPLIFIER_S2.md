# Phase S2 — Semantic-object microgeometry simplifier simulation

S2 is a deterministic dry-run only. It starts from the accepted post-B+C label map, applies the already accepted S1-aligned R2 simulation on a private clone, and then tests whether remaining failed microregions inside one `face`, `hand` or `key-detail` owner can be absorbed into a stable same-owner anchor. No S2 result is connected to production processing, UI, approval, the Final Region Map, numbering, contours, SVG or PDF.

## Algorithm and hard safeguards

- A donor must be a failed 4-connected component. Its target must be a directly adjacent, 5 pt-passable component at least as large as the donor.
- Every donor and target pixel must have exactly one identical S1 owner and the same compatible kind. Ambiguous, partial, cross-owner and critical ownership is rejected.
- Candidate anchors are ordered by longest shared boundary, then smallest Lab distance, then stable numeric IDs.
- Profiles differ only by maximum candidate Lab delta: conservative `8`, balanced `12`, exploratory `16`.
- A strong internal edge is an internal same-owner adjacency with Lab delta `>= max(12, current owner P90)`. Owner P90 is recomputed after every graph rebuild. A donor incident to any such edge is rejected, so accepted operations remove zero strong edges under all profiles.
- A donor that contains or touches a critical eye/text/logo mask, touches the owner silhouette, contains a hole, bridges two target-color components, or is the last global component of its color is rejected.
- Operations are applied to a private batch clone. The region graph and exact 5 pt readiness are rebuilt after each batch. The entire batch is rolled back unless region and FAIL counts fall by exactly the number of operations, coverage does not decrease, failed area does not increase, no previously passing component becomes failed, critical and silhouette pixels remain unchanged, and no production color disappears.
- The input `Uint8Array` is never mutated. Production code has no call site for `simulateSemanticObjectSimplifierFromLabelMap()`.

## Accepted baselines before S2

The post-B+C and S1-enabled R2 checkpoints exactly match the accepted S1 report.

| Fixture | Post-B+C regions / FAIL | S1-R2 regions / FAIL | Coverage | Failed area | R2 raster / graph | S1 mask |
|---|---:|---:|---:|---:|---|---|
| NEW174 | 541 / 0 | 541 / 0 | 100.000% | 0.000% | `CP-C3D5DBA9` / `RG-44DCEF87` | `SM-D87FBC8B` |
| FT159 | 2718 / 1147 | 2355 / 755 | 67.941% | 1.007% | `CP-10F1491C` / `RG-3996C9C3` | `SM-D83ED920` |
| FT160 | 1342 / 173 | 1277 / 107 | 91.621% | 0.201% | `CP-A2C3BE10` / `RG-69C9934C` | `SM-721800C4` |
| FT161 | 6778 / 5087 | 6271 / 4528 | 27.795% | 5.453% | `CP-1E438AA5` / `RG-A45C1D26` | `SM-20571C6A` |
| FT162 | 4052 / 1972 | 3739 / 1613 | 56.860% | 2.186% | `CP-457B2885` / `RG-74195731` | `SM-2C5B4403` |
| FT163 | 3865 / 1694 | 3465 / 1269 | 63.377% | 1.513% | `CP-39479DAC` / `RG-4C4CDBA3` | `SM-7144AC35` |

## Pareto comparison

`R` is regions, `F` total FAIL, `SF/NF` semantic/nonsemantic FAIL, `Cov` coverage, and `FA` failed raster area. Reduction columns measure S2 alone from the S1-R2 start; `Total F` measures the complete post-B+C → S1 → R2 → S2 chain.

| Fixture | Profile | R start→end | F start→end | SF start→end | NF start→end | Cov start→end | FA start→end | Ops | S2 R | S2 F | Total F |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NEW174 | C/B/E | 541→541 | 0→0 | 0→0 | 0→0 | 100→100% | 0→0% | 0 | 0% | 0% | n/a |
| FT159 | C | 2355→2348 | 755→748 | 700→693 | 55→55 | 67.941→68.143% | 1.007→1.001% | 7 | 0.297% | 0.927% | 34.786% |
| FT159 | B | 2355→2302 | 755→702 | 700→647 | 55→55 | 67.941→69.505% | 1.007→0.957% | 53 | 2.251% | 7.020% | 38.797% |
| FT159 | E | 2355→2273 | 755→673 | 700→618 | 55→55 | 67.941→70.392% | 1.007→0.922% | 82 | 3.482% | 10.861% | 41.325% |
| FT160 | C | 1277→1277 | 107→107 | 60→60 | 47→47 | 91.621→91.621% | 0.201→0.201% | 0 | 0% | 0% | 38.150% |
| FT160 | B | 1277→1276 | 107→106 | 60→59 | 47→47 | 91.621→91.693% | 0.201→0.200% | 1 | 0.078% | 0.935% | 38.728% |
| FT160 | E | 1277→1273 | 107→103 | 60→56 | 47→47 | 91.621→91.909% | 0.201→0.195% | 4 | 0.313% | 3.738% | 40.462% |
| FT161 | C | 6271→6162 | 4528→4419 | 4432→4323 | 96→96 | 27.795→28.286% | 5.453→5.357% | 109 | 1.738% | 2.407% | 13.132% |
| FT161 | B | 6271→5896 | 4528→4153 | 4432→4057 | 96→96 | 27.795→29.562% | 5.453→5.049% | 375 | 5.980% | 8.282% | 18.361% |
| FT161 | E | 6271→5768 | 4528→4025 | 4432→3929 | 96→96 | 27.795→30.218% | 5.453→4.877% | 503 | 8.021% | 11.109% | 20.877% |
| FT162 | C | 3739→3725 | 1613→1599 | 1545→1531 | 68→68 | 56.860→57.074% | 2.186→2.171% | 14 | 0.374% | 0.868% | 18.915% |
| FT162 | B | 3739→3595 | 1613→1469 | 1545→1401 | 68→68 | 56.860→59.138% | 2.186→2.030% | 144 | 3.851% | 8.927% | 25.507% |
| FT162 | E | 3739→3506 | 1613→1380 | 1545→1312 | 68→68 | 56.860→60.639% | 2.186→1.917% | 233 | 6.232% | 14.445% | 30.020% |
| FT163 | C | 3465→3306 | 1269→1110 | 1256→1097 | 13→13 | 63.377→66.425% | 1.513→1.355% | 159 | 4.589% | 12.530% | 34.475% |
| FT163 | B | 3465→3163 | 1269→967 | 1256→954 | 13→13 | 63.377→69.428% | 1.513→1.155% | 302 | 8.716% | 23.798% | 42.916% |
| FT163 | E | 3465→3123 | 1269→927 | 1256→914 | 13→13 | 63.377→70.317% | 1.513→1.081% | 342 | 9.870% | 26.950% | 45.277% |

## Visual-distortion diagnostics

| Fixture | Profile | Raster changed | Semantic changed | Lab mean / median / P90 / max | Active colors |
|---|---|---:|---:|---:|---:|
| FT159 | C | 0.0064% | 0.0918% | 7.124 / 7.980 / 7.980 / 7.980 | 45→45 |
| FT159 | B | 0.0498% | 0.7164% | 9.986 / 9.710 / 11.961 / 11.961 | 45→45 |
| FT159 | E | 0.0845% | 1.2168% | 11.554 / 11.961 / 14.956 / 15.517 | 45→45 |
| FT160 | C | 0% | 0% | 0 / 0 / 0 / 0 | 45→45 |
| FT160 | B | 0.0009% | 0.3759% | 9.318 / 9.318 / 9.318 / 9.318 | 45→45 |
| FT160 | E | 0.0060% | 2.5779% | 14.817 / 15.756 / 15.756 / 15.756 | 45→45 |
| FT161 | C | 0.0955% | 0.4364% | 5.967 / 5.649 / 7.617 / 7.973 | 41→41 |
| FT161 | B | 0.4036% | 1.8442% | 9.025 / 9.101 / 11.586 / 11.980 | 41→41 |
| FT161 | E | 0.5758% | 2.6307% | 10.651 / 10.832 / 13.983 / 15.090 | 41→41 |
| FT162 | C | 0.0148% | 0.2672% | 5.763 / 5.079 / 7.700 / 7.837 | 45→45 |
| FT162 | B | 0.1560% | 2.8256% | 9.318 / 9.496 / 11.665 / 11.980 | 45→45 |
| FT162 | E | 0.2685% | 4.8632% | 11.233 / 11.665 / 15.090 / 15.844 | 45→45 |
| FT163 | C | 0.1571% | 0.3081% | 5.922 / 5.966 / 7.387 / 7.838 | 43→43 |
| FT163 | B | 0.3579% | 0.7017% | 8.488 / 9.036 / 11.598 / 11.989 | 43→43 |
| FT163 | E | 0.4320% | 0.8471% | 10.039 / 9.635 / 14.692 / 15.977 | 43→43 |

For every fixture and profile: eliminated colors `[]`; strong internal boundaries removed `0 / 0 px / 0 mm`; owner silhouette pixels and boundary edges changed `0 / 0`; critical eye/text/logo pixels changed `0`; new failures `0`.

## Rejected operations

Counts are deterministic candidate evaluations across graph rebuilds, not unique regions.

| Fixture | Profile | Rejected reasons |
|---|---|---|
| FT159 | C | profile limit 3064; ambiguous 1758; different owner/kind 996; strong edge 910; silhouette 672; critical boundary 318; bridge 144; hole 6 |
| FT159 | B | profile limit 5621; ambiguous 3809; different owner/kind 2158; strong edge 1949; silhouette 1456; critical boundary 689; bridge 555; hole 26 |
| FT159 | E | profile limit 5752; ambiguous 4395; different owner/kind 2490; strong edge 2250; silhouette 1749; critical boundary 808; bridge 733; hole 30 |
| FT160 | C | ambiguous 150; profile limit 30; silhouette 29; strong edge 8 |
| FT160 | B | ambiguous 300; silhouette 58; profile limit 54; strong edge 16; bridge 4 |
| FT160 | E | ambiguous 600; silhouette 118; profile limit 89; strong edge 32; bridge 8 |
| FT161 | C | profile limit 66544; strong edge 23625; different owner/kind 12900; ambiguous 10280; silhouette 5160; critical boundary 2800; bridge 2196; unstable anchor 69 |
| FT161 | B | profile limit 54496; strong edge 23412; different owner/kind 12900; ambiguous 10280; bridge 5581; silhouette 5245; critical boundary 2860; unstable anchor 129 |
| FT161 | E | profile limit 42082; strong edge 23108; different owner/kind 12900; ambiguous 10280; bridge 9023; silhouette 5261; critical boundary 2828; unstable anchor 232; hole 20 |
| FT162 | C | ambiguous 8591; profile limit 8459; strong edge 3123; silhouette 2696; different owner/kind 2090; critical boundary 893; bridge 308 |
| FT162 | B | ambiguous 14839; profile limit 11222; strong edge 5245; silhouette 4794; different owner/kind 3610; critical boundary 1588; bridge 1162; unstable anchor 40 |
| FT162 | E | ambiguous 15620; profile limit 8412; strong edge 5424; silhouette 5053; different owner/kind 3800; bridge 2049; critical boundary 1657; unstable anchor 46 |
| FT163 | C | profile limit 23219; strong edge 11089; different owner/kind 6880; bridge 2499; critical boundary 1740; ambiguous 1460; silhouette 940; unstable anchor 100 |
| FT163 | B | profile limit 14399; strong edge 10545; different owner/kind 6880; bridge 3805; critical boundary 1740; ambiguous 1460; silhouette 940; unstable anchor 146 |
| FT163 | E | strong edge 10414; profile limit 9145; different owner/kind 6880; bridge 4631; critical boundary 1740; ambiguous 1460; silhouette 984; unstable anchor 135 |

## Owner-kind breakdown

Each cell is `operations / changed pixels / changed owner area / unresolved FAIL`.

| Fixture | Profile | Face | Hand | Key-detail |
|---|---|---:|---:|---:|
| FT159 | C | 3 / 64 / 0.068% / 325 | 4 / 140 / 0.120% / 277 | 0 / 0 / 0% / 0 |
| FT159 | B | 26 / 780 / 0.833% / 302 | 27 / 812 / 0.697% / 254 | 0 / 0 / 0% / 0 |
| FT159 | E | 40 / 1416 / 1.512% / 288 | 42 / 1288 / 1.106% / 239 | 0 / 0 / 0% / 0 |
| FT160 | C | 0 / 0 / 0% / 0 | 0 / 0 / 0% / 60 | 0 / 0 / 0% / 0 |
| FT160 | B | 0 / 0 / 0% / 0 | 1 / 28 / 0.376% / 59 | 0 / 0 / 0% / 0 |
| FT160 | E | 0 / 0 / 0% / 0 | 4 / 192 / 2.578% / 56 | 0 / 0 / 0% / 0 |
| FT161 | C | 97 / 2792 / 0.691% / 3227 | 0 / 0 / 0% / 0 | 12 / 264 / 0.116% / 708 |
| FT161 | B | 297 / 10524 / 2.603% / 3027 | 0 / 0 / 0% / 0 | 78 / 2392 / 1.050% / 642 |
| FT161 | E | 389 / 14612 / 3.614% / 2935 | 0 / 0 / 0% / 0 | 114 / 3812 / 1.673% / 606 |
| FT162 | C | 14 / 472 / 0.461% / 915 | 0 / 0 / 0% / 301 | 0 / 0 / 0% / 0 |
| FT162 | B | 109 / 3588 / 3.502% / 820 | 35 / 1404 / 3.589% / 266 | 0 / 0 / 0% / 0 |
| FT162 | E | 174 / 6436 / 6.281% / 755 | 59 / 2156 / 5.511% / 242 | 0 / 0 / 0% / 0 |
| FT163 | C | 159 / 5028 / 0.338% / 978 | 0 / 0 / 0% / 0 | 0 / 0 / 0% / 0 |
| FT163 | B | 302 / 11452 / 0.769% / 835 | 0 / 0 / 0% / 0 | 0 / 0 / 0% / 0 |
| FT163 | E | 342 / 13824 / 0.929% / 795 | 0 / 0 / 0% / 0 | 0 / 0 / 0% / 0 |

Under balanced, 7,118 semantic failures remain: face 4,984 (70.0%), hand 579, key-detail 642, and 913 critical/ambiguous/not-exactly-owned. Face microgeometry is the dominant unresolved class.

## Balanced trajectory and plateau

| Fixture | Pass | Operations | Regions | FAIL | Coverage | Failed area |
|---|---:|---:|---:|---:|---:|---:|
| NEW174 | 0 | 0 | 541 | 0 | 100.000% | 0.000% |
| FT159 | 0 / 1 / 3 / 5 / 8 / 10 / 12 | 0 / 14 / 30 / 37 / 46 / 51 / 53 | 2355 / 2341 / 2325 / 2318 / 2309 / 2304 / 2302 | 755 / 741 / 725 / 718 / 709 / 704 / 702 | 67.941 / 68.347 / 68.817 / 69.025 / 69.294 / 69.444 / 69.505% | 1.007 / 0.992 / 0.973 / 0.968 / 0.962 / 0.958 / 0.957% |
| FT160 | 0 / 1 | 0 / 1 | 1277 / 1276 | 107 / 106 | 91.621 / 91.693% | 0.201 / 0.200% |
| FT161 | 0 / 5 / 10 / 15 / 20 | 0 / 134 / 236 / 308 / 375 | 6271 / 6137 / 6035 / 5963 / 5896 | 4528 / 4394 / 4292 / 4220 / 4153 | 27.795 / 28.401 / 28.882 / 29.230 / 29.562% | 5.453 / 5.292 / 5.191 / 5.117 / 5.049% |
| FT162 | 0 / 5 / 10 / 14 / 18 | 0 / 80 / 121 / 137 / 144 | 3739 / 3659 / 3618 / 3602 / 3595 | 1613 / 1533 / 1492 / 1476 / 1469 | 56.860 / 58.103 / 58.762 / 59.023 / 59.138% | 2.186 / 2.097 / 2.061 / 2.040 / 2.030% |
| FT163 | 0 / 5 / 10 / 15 / 20 | 0 / 103 / 186 / 254 / 302 | 3465 / 3362 / 3279 / 3211 / 3163 | 1269 / 1166 / 1083 / 1015 / 967 | 63.377 / 65.318 / 66.972 / 68.390 / 69.428% | 1.513 / 1.356 / 1.268 / 1.199 / 1.155% |

FT159 flattens after about pass 5 and stops at pass 12. FT160 is exhausted after one operation. FT162 flattens after pass 10 and stops at pass 18. FT161 and FT163 show diminishing gains but still hit the 20-pass diagnostic cap, so their reported balanced results are bounded trajectories rather than a proven global optimum.

## Deterministic hashes

| Fixture | Profile | Raster checkpoint | Graph checkpoint | Label-map SHA-256 |
|---|---|---|---|---|
| NEW174 | C/B/E | `CP-C3D5DBA9` | `RG-44DCEF87` | `e481e02f869159c6f4bd0a329aa546aec8b8f25083483af49982682736c328f3` |
| FT159 | C | `CP-27D7DED0` | `RG-F57D3813` | `5df767b3b467e75672552d5858af8f62e19ce4c8b47a251c738a9eed04d7b127` |
| FT159 | B | `CP-93A87928` | `RG-FEC36145` | `c017ac7668c53cb24e10f266e928be7a683aab878333aa42608fbcd7ccb65707` |
| FT159 | E | `CP-1A1BA7DC` | `RG-0949B598` | `43b8b07a05b8b30830533b48449ad99afa524ec20289f0313e5fb2afa58dede4` |
| FT160 | C | `CP-A2C3BE10` | `RG-69C9934C` | `79a5562d7e65b34a8a6a3101fd6f7cba7415c7187814af045ea3afb4d769b63e` |
| FT160 | B | `CP-E63A5100` | `RG-FD7EACCB` | `e19aba1db839b787417b387c80da22d349f69be6f4b31f359e24626638934311` |
| FT160 | E | `CP-4DD8D488` | `RG-30B53D93` | `e2e78bfa4761543be54a95717d94136533202c6806cefa5b652b7931df124763` |
| FT161 | C | `CP-DBAEFAE5` | `RG-90F05B25` | `d128049c5fca29656d519a24b5174245ee2aac5590c586c334baa101988cb52d` |
| FT161 | B | `CP-10DC7661` | `RG-ADC1183E` | `adf57feaa193cfd7dde303852206164ec4b4321ae13fdd607d2bc203adc9735b` |
| FT161 | E | `CP-DF4C8255` | `RG-7FFBDDEE` | `05d5a00cb697d0702d316eb8aa92e36de908c2a8159a2b5ef186e8b6ab88b1f5` |
| FT162 | C | `CP-CDAD4039` | `RG-DBE52541` | `6aca58d55af4f12575463e38198336dbebfa985755a8920983294ea6fbd3224f` |
| FT162 | B | `CP-E970E55D` | `RG-DCBF1A2A` | `a1edff48e2180678fa96d8f8843f4c5cd535914853012c4e09a2c359a144750d` |
| FT162 | E | `CP-48CC27C5` | `RG-45F79C01` | `0508f61820dbc1323b997b6d1cb013b6ff13524867f42bfae4cc947f61ef6868` |
| FT163 | C | `CP-4AF22008` | `RG-34125518` | `b1f47c1d685c28972296587110058cb89c74ae478c338784d2709160188ed8dc` |
| FT163 | B | `CP-676E97BC` | `RG-1E2501A6` | `6307e1c5170a6bf0f07dceeac4e1d1927d6ea06598f5015440af295a33387ef4` |
| FT163 | E | `CP-0A282570` | `RG-3262D6EB` | `4f404ad09de12fc2084df1799824621b6ebc08f72c45cf5ac4fa5afb23634921` |

## NEW174 production invariance

Two production runs from the S2 worktree are identical to each other and to a separate clean worktree at exact base `600324b816d47cc07553b8769245316123cda444`:

- regions / numbers / merged / unlabeled: `541 / 541 / 0 / 0`
- checkpoint: `CP-C3D5DBA9`
- map: `e75864e8367b75661636814c92e6a6e427d0ae5aad1654dcec28442a3b20d170`
- contour PNG bytes in this runtime: `ce91e04e1ba3cdc0c751990b413886180cca6f5bc4c72c7f826aad69b11f12f9`
- contour decoded pixels, 2400×3000: `25951393957ec07ab25a48644642bae93e00c139ccff263cad80d776e3edeeac`
- SVG: `8139cbd381e9dfec279da13e978d347031b5b1447378ec275999483eab8d032a`
- PDF: `a6a1f2825b3b9497acf1640823c8d4c27e99a9c63094a1353d42b6c7236bc066`

The contour PNG byte hash is encoder/runtime-specific; the exact clean-base comparison and decoded-pixel hash both match within the same runtime.

## Critical questions

1. **Total FAIL reduction thresholds.** No fixture reaches 50%. Balanced exceeds 25% only on FT159, FT160, FT162 and FT163; FT161 reaches only 18.361%. Conservative exceeds 25% on FT159, FT160 and FT163. Exploratory exceeds 25% on FT159, FT160, FT162 and FT163.
2. **Total region reduction.** No fixture reaches 25% under any profile; exploratory maxima range from 5.142% to 19.198% across FT fixtures.
3. **Gain attributable to balanced S2.** Relative to the S1-R2 remaining FAIL, S2 removes 7.020% FT159, 0.935% FT160, 8.282% FT161, 8.927% FT162 and 23.798% FT163. Expressed as added percentage points from the original post-B+C baseline: +4.621, +0.578, +7.372, +7.302 and +17.828 pp respectively.
4. **Dominant unresolved owner.** Face dominates: 4,984 of 7,118 balanced semantic failures (70.0%). Hand has 579, key-detail 642, and 913 are critical/ambiguous/not-exactly-owned.
5. **Balanced versus conservative.** Balanced is materially better on FT159 and FT161–FT163 while keeping P90 below 12 and total raster change at or below 0.404%. It is not materially better on FT160, where it resolves only one additional region.
6. **Production recommendation.** S2 proves that a bounded semantic optimizer can safely recover useful regions, especially FT163, but it neither approaches PASS nor reaches 50% total FAIL reduction, and it never reaches 25% total region reduction. Do not wire S2 into production yet. Remaining face-dominated microgeometry still requires upstream semantic segmentation or preview reconstruction; S2 may remain a diagnostic basis for a later separately approved optimizer.

## Verification

- Deterministic synthetic graph/R2/S1/S2 suite: `15 passed, 0 failed`.
- S2 safety tests cover critical-boundary preservation, owner-silhouette preservation, ambiguous ownership, strong-edge preservation, dry-run input immutability, and whole-batch rollback when the final components of a production color would disappear.
- Lint: `0 errors`; 7 pre-existing warnings in `app/studio.tsx`.
- Build: PASS.
- No AI call, semantic-analysis API change, deploy or production integration was performed.
