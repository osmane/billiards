# Massé Vuruşu: Sayısal Model (JavaScript-uyumlu denklemler)

> **Not:** Bu dosya bir teknik rehberdir. Parametreler deneyle kalibre edilmelidir (sürtünme, restitüsyon, Magnus katsayısı vb.).

---

## İçindekiler
1. Özet
2. Temel sabitler ve birimler
3. Model fazları
   - A. İmpuls / Etki (cue → top)
   - B. Masa yüzeyinde: kayma → yuvarlanma
   - C. Zıplama / Uçuş (hava etkileri + Magnus)
   - D. Minder (cushion) ve masa çarpışmaları
4. Denklemler (JavaScript formatında)
   - Vektör yardımcı fonksiyonları
   - Dinamik denklemler
   - İmpuls çözümü (normal & tangential)
5. Sayısal çözüm stratejisi / Pseudocode (JS)
6. Kalibrasyon, hassas noktalar ve eksik/eklenmesi gereken hususlar
7. Önerilen parametre aralıkları & testler
8. Referans başlıkları (okuma listesi)

---

## 1. Özet
Bu model aşağıdaki fiziksel etkileri kapsar:
- Çubuğun topa uyguladığı impulsun lineer ve açısal etkileri (temas geometriye bağlı)
- Masa yüzeyinde kayma → yuvarlanma geçişi (Coulomb sürtünme + tangential compliance opsiyonel)
- Zıplama durumunda yerçekimi, hava sürüklemesi ve Magnus etkisi
- Minder (cushion) ve tekrar temasta normal/tangential restitüsyon ve tangential compliance

Amaç: başlangıç parametrelerinden (vuruş yönü, offset, çubuk elevation, hedef hız/impuls) hareketle zaman serileri `pos(t)`, `vel(t)`, `omega(t)` üretmek.

---

## 2. Temel sabitler ve birimler
(Tüm SI birimlerinde)

```js
const m = 0.17;      // kg, top kütlesi (örnek)
const R = 0.0286;    // m, yarıçap
const I = (2/5) * m * R*R; // topun eylemsizlik momenti (katı küre)
const g = 9.81;      // m/s^2
const rho = 1.2;     // kg/m^3 hava yoğunluğu
const A = Math.PI * R*R; // projeksiyon alanı
```

Kalibre edilecek parametreler (örnek aralıklar):
```js
let mu_k = 0.14;       // kinetik sürtünme (masa-top)
let c_rr = 0.01;       // yuvarlanma direnç katsayısı (küçük)
let e_n = 0.98;        // normal restitüsyon (masa/top kombinasyonu)
let Cd = 0.5;          // sürükleme katsayısı (hız/Re'ye bağlı)
let kM = 0.0005;       // Magnus katsayısı (deneyle kalibre edilecek)
// Tangential compliance için (opsiyonel)
let k_t = 1e5;         // N/m (tangential stiffness)
let c_t = 10;          // Ns/m (tangential damping)
```

> Not: `k_t` ve `c_t` tangential spring-dashpot temsili içindir (Stronge/rod-cross tipi modeller). Değerler yüzey+kaplama ile değişir.

---

## 3. Model fazları (özet)

### A) İmpuls / Etki (çok kısa süreli)
- Çubuğun temas noktası merkezden `r = {x:e_x, y:e_y, z:e_z}` ile tanımlanır.
- Çubuk vuruş yönü `u_c` (birim vektör) ve impuls büyüklüğü `J` ya da hedef `v_target` verilir.
- Çıktı: `v0` (merkez-of-mass başlangıç hızı), `omega0` (açısal hız başlangıcı).

### B) Masa yüzeyinde: kayma → yuvarlanma
- Kayma döneminde tangential sürtünme `F_f = -mu_k * m * g * v_rel_hat` uygulanır.
- Kayma sonlandığında yuvarlanma: `v_contact = R * omega_parallel` sağlanır; gayri-lineer yuvarlanma direnç terimleri eklenir.

### C) Zıplama / Uçuş
- Eğer `v0.z > 0` ve lift-off koşulu sağlanırsa top uçuşa geçer.
- Uçuşta: `m * dv/dt = -m*g*z_hat - 0.5*rho*Cd*A*|v|*v + kM * (omega x v)`
- Açısal hızda hava torku ile sönümleme: `I * domega/dt = -c_air * omega` (küçük, opsiyonel)

### D) Minder / Çarpışma ile tema tekrar
- İnişte temas normal bileşeni restitüsyon: `v_n_plus = -e_n * v_n_minus`.
- Tangential impulse `J_t` tangential compliance veya Coulomb sürtünme ile hesaplanır; açısal hız güncellenir: `delta_omega = (R * J_t) / I`.

---

## 4. Denklemler (JavaScript formatında)
Aşağıda temel vektör yardımcı fonksiyonları ve dinamik denklemler JS-uyumlu biçimde verilmiştir.

### 4.1 Vektör yardımcıları (kullanım önerisi)
```js
function add(a,b){ return {x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}; }
function sub(a,b){ return {x:a.x-b.x, y:a.y-b.y, z:a.z-b.z}; }
function mul(a, s){ return {x: a.x*s, y: a.y*s, z: a.z*s}; }
function dot(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
function cross(a,b){ return {x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x}; }
function mag(a){ return Math.sqrt(dot(a,a)); }
function normalize(a){ let m = mag(a)||1; return mul(a, 1/m); }
```

### 4.2 İmpuls (etki) — basit yaklaşık form
**Girdi:** `J` (skaler impuls büyüklüğü) veya hedef hız `v_target` ve `u_c` (vuruş yönü), temas ofseti `r`.

```js
// lineer başlangıç hızı
let v0 = mul(u_c, J / m); // v0 = (J/m) * u_c

// açısal hız yaklaşık (tangential impulse ihmal edilirse)
// omega0 = invI * ( r x (J * u_c) )
// burada invI = 1 / I (skaler, küre için); vektörel I basitleştirmesi yapıldı
let omega0 = mul(cross(r, mul(u_c, J)), 1 / I);

// Not: Daha doğru çözüm için normal/tangential impuls bileşenleri Jn, Jt birlikte çözülür.
```

### 4.3 Normal çarpışma (Hertz-like veya lineer spring-dashpot)
**Hertz-like (yaklaşık):** `F_n = k * Math.pow(delta, 1.5) + c * deltaDot`

```js
function normalForce(delta, deltaDot, k, c){
  return k * Math.pow(Math.max(delta,0), 1.5) + c * deltaDot;
}
```

Bu model normal impulse `J_n = ∫ F_n dt` ile hesaplanır. Alternatif basit model: `v_n_plus = -e_n * v_n_minus` kullan.

### 4.4 Tangential compliance (Stronge tipi) — basit spring-dashpot
Tangential kuvvet `F_t` kontak boyunca bir tangential yay/damper ile modellemek için:
```js
// v_rel_t: temas noktasındaki göreceli tangential hız vektörü
// s_t: tangential kayma (integral of v_rel_t over contact time)
// F_t = -k_t * s_t - c_t * v_rel_t
function tangentialForce(s_t, v_rel_t, k_t, c_t){
  return sub(mul(s_t, -k_t), mul(v_rel_t, c_t));
}
```
Tangential impulse `J_t = ∫ F_t dt`. Ancak Coulomb sınırı uygulanmalıdır: `|J_t| <= mu_s * J_n`.

### 4.5 Yatay (masa üzeri) dinamikler — sürekli evrim (masa üzerinde)
```js
// top merkezi için: m * dv_dt = F_total_xy (sürtünme + küçük drag)
// açısal: I * domega_dt = torque = R * (contactNormal x F_t)  (basitleştirilmiş)

function onTableDerivatives(state){
  // state: {pos, vel, omega}
  // compute v_rel_at_contact = vel + cross(omega, r_contact)
  let v_rel = sub(state.vel, cross(state.omega, {x:0, y:0, z:R}));
  let v_rel_t = {x: v_rel.x, y: v_rel.y, z: 0};
  let v_rel_t_mag = mag(v_rel_t);

  let F_f;
  if(v_rel_t_mag > slipTol){
    // sliding
    F_f = mul(normalize(v_rel_t), -mu_k * m * g);
  } else {
    // rolling resistance
    F_f = mul(normalize(state.vel), -c_rr * m * g);
  }

  let a = mul(F_f, 1 / m);
  let torque = mul(cross({x:0,y:0,z:-R}, F_f), 1); // approx
  let domega_dt = mul(torque, 1 / I);

  return { dv_dt: a, domega_dt: domega_dt };
}
```

> Bu kısımda `r_contact` topun masaya temas noktasındaki vektördür (genelde {0,0,-R}). `slipTol` küçük bir tolerans.

### 4.6 Uçuş fazı denklemleri (hava + Magnus)
```js
// F_drag = 0.5*rho*Cd*A*|v|*v  (vector form)
function dragForce(v){ let vmag = mag(v); return mul(v, -0.5 * rho * Cd * A * vmag); }

// F_magnus = kM * cross(omega, v)
function magnusForce(omega, v){ return mul(cross(omega, v), kM); }

// translational
// m * dv_dt = -m*g*z_hat + F_drag + F_magnus

// rotational (basit sönüm)
// I * domega_dt = -c_air * omega  (opsiyonel)
```

### 4.7 Çarpışma sonrası spin güncellemesi (iniş)
- Normal impulse `J_n` kullanılarak normal hıza güncelleme: `v_n_plus = -e_n * v_n_minus`.
- Tangential impulse `J_t` hesaplanır (spring/damper veya Coulomb):
  - Eğer `|J_t_candidate| <= mu_s * J_n` ise `J_t = J_t_candidate` (stick veya compliance sonucu).
  - Aksi halde `J_t = -mu_k * J_n * sign(v_rel_t)` (sliding).

Açısal hız güncellemesi (merkez):
```js
// delta_omega = (R * J_t_vec) / I   (vektörel)
omega_plus = add(omega_minus, mul(cross(r_contact, J_t_vec), 1 / I));

// merkez hızı güncellemesi
v_plus = add(v_minus, mul(J_vec, 1 / m));
```

---

## 5. Sayısal çözüm stratejisi / Pseudocode (JS)
Aşağıdaki yapı **event-driven + küçük-dt** (hybrid) yaklaşımı kullanır.

```js
// Başlangıç: parametreler, vuruş bilgisi
let state = { pos: {x:0,y:0,z:R}, vel: v0, omega: omega0 };
let t = 0; let dt = 0.0005; // 0.5 ms, kayma fazında küçük dt tavsiye
let Tmax = 10.0;

while(t < Tmax){
  if(state.pos.z <= R + eps && state.vel.z <= 0){
    // contact/çarpışma event: anlık impuls çözümü
    // 1) compute normal relative speed v_n_minus
    // 2) compute J_n from restitution: J_n = m*( -(1+e_n) * v_n_minus ) / (1 + m_eff)
    //    (basit alınmış; daha doğru temassal model için spring-dashpot entegre edilmelidir)
    // 3) compute candidate J_t from tangential compliance (integral of F_t)
    // 4) enforce Coulomb limit
    // 5) update v and omega using v += J / m; omega += invI * (r x J_t)
  }

  if(state.pos.z > R + liftTol){
    // flight: use RK4 integrating m*dv/dt and I*domega/dt
    // dv_dt = (-m*g*z_hat + dragForce(state.vel) + magnusForce(state.omega, state.vel)) / m
    // integrate pos and vel with RK4
    // integrate omega with simple RK4 or semi-implicit
  } else {
    // on-table: semi-implicit Euler or RK4 for translation + rotation using onTableDerivatives
  }

  // geometry checks: cushion collisions (line-segment intersection with cushion plane)
  // if cushion impact, handle similarly to contact impulse but cushion properties (e_n_cushion, mu_cushion)

  t += dt;
}
```

**Adım boyutu önerileri:**
- İmpuls anı (analitik) → event-driven
- Kayma fazı → dt ~ 1e-4 .. 1e-3 s (0.1–1 ms)
- Uçuş fazı → dt ~ 1e-3 .. 2e-3 s

**Entegratör önerisi:** RK4 veya yarı-üstel (semi-implicit) Euler; açısal entegre için quaternion tabanlı entegrasyon (3D) tavsiye edilir.

---

## 6. Kalibrasyon, hassas noktalar ve eksik/eklenmesi gereken hususlar
Aşağıdaki hususlar model doğruluğu için kritik olup simülasyona eklenmelidir veya deneyle kalibre edilmelidir:

1. **Tangential compliance parametreleri (`k_t`, `c_t`)**: gerçek minder ve cloth kaplama davranışını temsil etmelidir. Tangential compliance, spin değişimi ve temas süresini büyük oranda etkiler.
2. **Hava katsayıları** (`Cd`, `kM`): top yüzeyi, hızlı spin ve düşük uçuş süresinde Magnus etkisi küçük olabilir; `kM` deneysel olarak ölçülmelidir.
3. **Squirt / cue-deflection etkisi**: çubuğun sapması (cue squirt) başlangıç yönünü değiştirir; impuls çözücüsünde cue-top mekanik modelini (çubuk esnekliği, glancing impacts) eklemek isabeti artırır.
4. **Kontakt geometri modellenmesi**: topun dikişi (seam), örtü pürüzlülüğü, masa kaplamasının lokal deformasyonu mikro-etkiler oluşturur.
5. **3D açısal integrasyon (quaternion)**: yalnızca skaler `omega` değil 3 bileşenli açısal hız ve topun dönüş ekseninin zamana bağlı değişimi hesaba katılmalı.
6. **Sürtünme katsayılarının hız/temperature bağımlılığı**: realistik olarak `mu_k` hızla değişebilir; yüksek hızlı kaymalarda kinetik sürtünme farklı olabilir.
7. **Enerji korunum kontrolü & stabilite**: numerik entegrasyon sonrası enerji ve momentum denetimleri ekleyin, hatalı parametre/çok büyük dt durumlarını yakalayın.
8. **Çoklu temas / rebound zincirleri**: cushion-top-masa arasındaki hızlı ardışık çarpışma dizilerini doğru yakalamak için event tespit hassasiyeti artırılmalı.

---

## 7. Önerilen parametre aralıkları & testler
- `m`: 0.16–0.17 kg
- `R`: 0.028–0.029 m
- `mu_k`: 0.12–0.20 (ölçümle kalibre)
- `e_n`: 0.90–0.99 (masa+top kombinasyonuna bağlı)
- `Cd`: 0.4–0.7 (hız/Re bağlı)
- `kM`: 1e-4 .. 1e-3 (çok değişken; deneyle belirleyin)

**Test vakaları (örnek):**
1. Sıfır elevation, center hit: top düz şekilde ilerlemeli; spin çok az.
2. Offset horizontal (english) only: squirt ve yan spin gözlemlenmeli.
3. Elevation (masse) with e_z > 0: küçük zıplamalar, uçuşta Magnus etkisi ile lateral sapma (yüksek spinlerde belirgin).
4. Yumuşak minder (tangential compliance yüksek): iniş sonrası spin artışı veya spin yön değişimi (kayıtla karşılaştırma).

---

## 8. Referans başlıkları (önerilen okumalar)
- Rod Cross — çalışmalar (cue/ball deflection, impact with tangential compliance)
- W. J. Stronge — "Oblique impact with friction and tangential compliance"
- A. Doménech-Carbó — "Independent friction–restitution description"
- Mathavan et al. — "Numerical simulations of frictional collisions of solid balls"
- American Journal of Physics — "Flight and bounce of spinning sports balls"

---

## Son notlar / eksik kalan hususlar (özet)
- Bu doküman, **JS-format** denklem seti ve simülasyon iskeleti sağlar; ama gerçekçi sonuçlar için deneysel kalibrasyon esastır.  
- Tangential compliance modelleri (Stronge tipi) ve tam Hertz-contact entegrasyonu daha karmaşıktır; isterseniz bu kısımların tam ayrıntılı matematiksel türevini — adım adım — belgeye ekleyebilirim.
- Eğer isterseniz, bu `.md` dosyasından doğrudan alınabilecek bir **JavaScript simülasyon iskeleti (çalıştırılabilir)** hazırlayıp test verileri ile birlikte ekleyebilirim.

---

*Bitti.*
