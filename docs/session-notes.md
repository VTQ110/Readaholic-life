# Readaholic Life: tóm tắt phiên làm việc

**Trang:** https://vtq110.github.io/Readaholic-life/ · **Repo:** `VTQ110/Readaholic-life` (Public, nhánh `master`)

## Yêu cầu ban đầu
Trang web Next.js để đăng truyện tự viết theo chương:
- dữ liệu lưu bằng file;
- phải nhập mã bí mật mới vào được;
- là trang tĩnh, deploy lên GitHub Pages.

## Kiến trúc
- **Next.js 15, `output: "export"`**: trang tĩnh, `basePath` lấy từ `actions/configure-pages`.
- **Đường dẫn dùng query** (`/truyen/?id=slug`, `/doc/?id=slug&ch=n`), nên không cần tạo trang tĩnh cho từng truyện.
- **Mã hoá:**
  - Lúc build, `scripts/build-data.mjs` đọc `content/`, chuyển Markdown sang HTML, rồi mã hoá AES-256-GCM. Khoá sinh từ `ACCESS_CODE` bằng PBKDF2 (250k vòng, salt trong `content/site.json`).
  - Kết quả ghi ra `public/data/*.json`. Trình duyệt chỉ giải mã được khi người đọc nhập đúng mã.
- **Nguồn truyện:**
  - `content/stories/<slug>/` chứa `story.enc.json`, `cover.enc.json` và `chapters/NNN.enc.json`, đều đã mã hoá, do trang Quản lý tạo.
  - Vẫn đọc được file thường (`story.json`, `cover.jpg`, `NNN.md`), nhưng các file này **lộ nội dung** vì repo để Public.
- **Trang Quản lý** (`/quan-ly/`): commit thẳng vào repo qua GitHub API (Git Data API, nhiều file trong một commit), sau đó GitHub Actions tự build lại.

## Tính năng (theo thứ tự commit)
1. `adb4720`: khung trang, cổng nhập mã, danh sách truyện, trang truyện, trang đọc (cỡ chữ, giao diện sáng/giấy cũ/tối, phím ←/→, nhớ chương đang đọc), workflow deploy.
2. `cb71ff3`: tìm kiếm theo tên/tác giả (gõ không dấu được), lọc theo thể loại và tình trạng; bộ lọc lưu trên URL.
3. `733daba`: trang Quản lý: thêm/sửa/xoá truyện và chương, ảnh bìa, xem trước, tự lưu nháp trên trình duyệt, mã hoá trong trình duyệt trước khi commit; script `npm run reencrypt`.
4. `6cd9860`: sửa lỗi gõ tiếng Việt (Telex/VNI) ở ô tìm kiếm; kiểm tra quyền ghi thật của token khi kết nối.
5. `05675d7`: lọc theo tác giả; chọn phông khi đọc (Mặc định, Bookerly, Caecilia, Literata).
6. `ccabc6e`: tải từng chương hoặc cả truyện dạng EPUB/TXT, tạo ngay trên trình duyệt.
7. `a730ec7`: đăng nhập Quản lý bằng mật khẩu quản lý (token lưu trong secret, mã hoá bằng `ADMIN_PASSWORD` lúc build).
8. `96250b3`: tạo truyện bằng cách nhập file EPUB (EPUB 2/3, tách chương theo mục lục, xem lại trước khi lưu).

## Cấu hình GitHub (đã làm)
- **Settings → Pages → Source:** **GitHub Actions**. Không chọn "Deploy from a branch", vì Jekyll sẽ ghi đè trang.
- **Secrets → Actions:**

  | Secret | Dùng để |
  |---|---|
  | `ACCESS_CODE` | mã đọc truyện |
  | `ADMIN_TOKEN` | token GitHub fine-grained: chỉ repo này, quyền Contents: Read and write |
  | `ADMIN_PASSWORD` | mật khẩu quản lý, dài 12 ký tự trở lên, khác `ACCESS_CODE` |

## Việc thường làm
- **Đăng truyện:** nhập mã, vào **Quản lý**, nhập mật khẩu quản lý, rồi **+ Truyện mới**, **+ Thêm chương** hoặc **⬆ Nhập từ EPUB**. Trang tự cập nhật sau 1–2 phút.
- **Đổi mã đọc truyện:**
  1. `git pull && npm run reencrypt -- <cũ> <mới>`, rồi commit và push.
  2. Đổi secret `ACCESS_CODE`.
- **Token hết hạn:** tạo token mới, cập nhật secret `ADMIN_TOKEN`, chạy lại workflow, rồi đăng xuất và đăng nhập lại trong trang Quản lý.
- **Chạy trên máy:** tạo `.env.local` có `ACCESS_CODE=...`, rồi `npm run dev`. Nếu thiếu mã đúng, build sẽ báo không giải mã được truyện thật.

## Sự cố đã gặp và cách xử lý
- **Deploy lỗi "Get Pages site failed":** chưa bật Pages với Source = GitHub Actions.
- **Trang lúc đúng lúc sai:** Source bị đổi sang "Deploy from a branch", Jekyll chạy song song và ghi đè. Đổi lại Source = GitHub Actions.
- **"Token không có quyền ghi":** `permissions.push` trong thông tin repo là quyền của tài khoản, không phải của token. Giờ khi kết nối, trang thử tạo một blob rỗng để kiểm tra quyền ghi thật.
- **Gõ tiếng Việt bị mất chữ:** ô tìm kiếm lấy giá trị từ URL, cập nhật mỗi phím nên làm hỏng bộ gõ. Giờ ô nhập giữ giá trị riêng và chỉ cập nhật URL sau 400ms.

## Giới hạn và lưu ý
- **Tên thư mục truyện (slug)** hiện trên URL và tên file dữ liệu; mọi nội dung khác đều được mã hoá.
- **Mã đọc truyện ngắn** (6 số) có thể bị dò thử nếu ai đó tải dữ liệu về; nên dùng mã dài.
- **Token đã mã hoá nằm công khai trên trang** (`data/admin.json`), nên độ an toàn phụ thuộc vào việc mật khẩu quản lý đủ mạnh.
- **Bookerly và Caecilia** là phông bản quyền, không kèm sẵn. Trang chỉ dùng được khi máy người đọc đã cài, hoặc khi đặt file vào `public/fonts/`; nếu không thì dùng phông thay thế.
- **File EPUB/TXT tải về** không còn được mã hoá.
- **Nhập EPUB:**
  - bỏ qua hình minh hoạ trong chương (ảnh bìa vẫn giữ);
  - chỉ tạo truyện mới, không gộp vào truyện có sẵn;
  - không đọc được EPUB có DRM.

## Tệp chính
- `scripts/build-data.mjs`: đọc `content/`, mã hoá ra `public/data/`, đóng gói token quản lý.
- `scripts/reencrypt.mjs`: mã hoá lại khi đổi mã đọc truyện.
- `scripts/new-story.mjs`, `scripts/new-chapter.mjs`: tạo truyện/chương bằng file (không mã hoá).
- `src/lib/crypto.ts`: mã hoá/giải mã AES-GCM, PBKDF2.
- `src/lib/auth.tsx`: cổng nhập mã.
- `src/lib/github.ts`: gọi GitHub API, commit nhiều file một lần.
- `src/lib/content.ts`: đọc/ghi truyện gốc cho trang Quản lý.
- `src/lib/download.ts`: tạo file EPUB/TXT.
- `src/lib/epub.ts`: đọc EPUB khi nhập truyện.
- `src/lib/fonts.ts`, `src/lib/fontFaces.ts`: phông khi đọc.
- `src/app/`: các trang `/`, `/truyen`, `/doc`, `/quan-ly`, `/quan-ly/truyen`, `/quan-ly/chuong`, `/quan-ly/nhap-epub`.
- `.github/workflows/deploy.yml`: build và deploy lên GitHub Pages.
