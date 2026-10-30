# Readaholic Life

Trang web tĩnh (Next.js) để đăng truyện tự viết theo chương. Dữ liệu lưu bằng file trong thư mục `content/`, khi vào trang phải nhập **mã bí mật**. Deploy tự động lên GitHub Pages.

## Mã bí mật hoạt động thế nào

Lúc build, toàn bộ truyện được **mã hoá AES-256-GCM** bằng khoá sinh từ mã bí mật (PBKDF2, 250.000 vòng). Trang web đăng lên chỉ chứa dữ liệu đã mã hoá; người đọc nhập đúng mã thì trình duyệt mới giải mã được. Không ai xem được nội dung chỉ bằng cách mở mã nguồn trang.

Lưu ý:

- Mã càng dài càng an toàn. Mã 6 chữ số có thể bị dò thử nếu ai đó cố tình tải dữ liệu về; nên dùng từ 8–10 ký tự trở lên.
- Tên thư mục truyện (slug) vẫn hiện trên URL và tên file dữ liệu; tên truyện, nội dung, ảnh bìa đều được mã hoá.
- Đổi mã: chỉ cần đổi secret `ACCESS_CODE` rồi chạy lại workflow. Người đọc cũ sẽ phải nhập mã mới.
- Sau khi nhập đúng, trình duyệt ghi nhớ cho lần sau. Bấm **Khoá** để đăng xuất.

## Cấu trúc dữ liệu

```
content/
├── site.json                    # Tên trang, mô tả
└── stories/
    └── ten-truyen/              # mỗi truyện một thư mục (slug)
        ├── story.json           # thông tin truyện
        ├── cover.jpg            # ảnh bìa (tuỳ chọn: .jpg .png .webp)
        └── chapters/
            ├── 001.md           # mỗi chương một file Markdown
            ├── 002.md
            └── ...
```

`story.json`:

```json
{
  "title": "Tên truyện",
  "author": "Bút danh",
  "description": "Giới thiệu truyện",
  "status": "ongoing",
  "tags": ["Ngôn tình", "Hiện đại"],
  "created": "2026-10-30"
}
```

- `status`: `"ongoing"` (đang ra) hoặc `"completed"` (hoàn thành).
- `tags`: thể loại. Trang chủ có ô tìm kiếm theo tên truyện/tác giả (gõ không dấu cũng được), lọc theo thể loại và tình trạng.
- Thêm `"draft": true` để ẩn cả truyện.

Mỗi chương (`chapters/001.md`):

```markdown
---
title: "Chương 1: Khởi đầu"
date: 2026-10-30
---

Nội dung chương. Mỗi đoạn cách nhau một dòng trống.
```

- Chương được sắp theo tên file (001, 002, ...).
- Thêm `draft: true` vào phần đầu để ẩn chương đang viết dở.

## Đăng truyện / chương mới

```bash
npm run new-story -- "Tên truyện"                 # tạo thư mục truyện mới
npm run new-chapter -- ten-truyen "Chương 3: ..." # thêm chương tiếp theo
```

Viết nội dung, rồi `git add . && git commit -m "Thêm chương 3" && git push`. GitHub Actions sẽ tự build và cập nhật trang trong 1–2 phút.

Có thể làm hoàn toàn trên web GitHub: vào thư mục `content/stories/<truyen>/chapters/` → **Add file → Create new file** → đặt tên `003.md`, dán nội dung, Commit.

## Deploy lên GitHub Pages (làm một lần)

1. **Settings → Secrets and variables → Actions → New repository secret**: tên `ACCESS_CODE`, giá trị là mã bí mật của bạn.
2. **Settings → Pages → Build and deployment → Source**: chọn **GitHub Actions**.
3. Push lên nhánh `main` (hoặc `master`), hoặc vào tab **Actions → Deploy to GitHub Pages → Run workflow**.

Trang sẽ có địa chỉ `https://<tên-user>.github.io/<tên-repo>/`.

## Chạy trên máy

```bash
npm install
cp .env.example .env.local   # sửa ACCESS_CODE trong file này
npm run dev                  # http://localhost:3000
```

Khi sửa truyện lúc đang chạy `npm run dev`, chạy `npm run data` ở cửa sổ khác rồi tải lại trang.

`npm run build` tạo trang tĩnh trong thư mục `out/`.
