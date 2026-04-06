# Notlarım — App Store / Play Store Kurulum Rehberi

## 1. Gereksinimler

### Her iki platform için:
- Node.js (https://nodejs.org) — LTS sürümü indir
- Git

### iOS (App Store) için ekstra:
- Mac bilgisayar (zorunlu)
- Xcode 15+ (Mac App Store'dan ücretsiz)
- Apple Developer hesabı: https://developer.apple.com ($99/yıl)

### Android (Play Store) için ekstra:
- Herhangi işletim sistemi
- Android Studio: https://developer.android.com/studio (ücretsiz)
- Google Play Console hesabı: https://play.google.com/console ($25 tek seferlik)

---

## 2. Kurulum Adımları

```bash
# 1. Bu klasöre gel
cd note-app

# 2. Bağımlılıkları yükle
npm install

# 3. iOS projesi oluştur (Mac'te)
npx cap add ios
npx cap sync ios

# 4. Android projesi oluştur
npx cap add android
npx cap sync android
```

---

## 3. iOS — App Store'a Gönderme

```bash
# Xcode'da aç
npx cap open ios
```

Xcode'da:
1. Sol üstten **Notlarım** projesini seç
2. **Signing & Capabilities** → Apple Developer hesabını bağla
3. **Product → Archive**
4. **Distribute App → App Store Connect**
5. https://appstoreconnect.apple.com adresinde uygulamayı tamamla

---

## 4. Android — Play Store'a Gönderme

```bash
# Android Studio'da aç
npx cap open android
```

Android Studio'da:
1. **Build → Generate Signed Bundle / APK**
2. **Android App Bundle** seç → keystore oluştur (sakla!)
3. Release bundle oluştur
4. https://play.google.com/console adresine yükle

---

## 5. Uygulama Güncelleme

Kodda değişiklik yapınca:
```bash
npx cap sync
# Sonra tekrar Xcode/Android Studio'dan build al
```

---

## 6. Fiyat Belirleme

| Yöntem | Açıklama |
|---|---|
| Ücretli | Direkt fiyat (ör. ₺29) |
| Freemium | Temel ücretsiz, ekstra özellikler ücretli |
| Abonelik | Aylık/yıllık ücret |

**Komisyon:** Her iki store da satıştan %30 keser (ilk yıl küçük geliştirici indirimi ile %15).
