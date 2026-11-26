# Vietnam Market Intelligence & Customer Needs/Wants System

Ứng dụng bản đồ số để tìm kiếm, so sánh và đánh giá địa bàn kinh doanh tại Việt Nam. Bản demo có bản đồ đa lớp, bộ lọc, hồ sơ địa bàn, biểu đồ so sánh và chấm điểm Min–Max có thể xuất CSV/JSON.

**Công nghệ** React, TypeScript, Vite, Tailwind CSS, Leaflet và Chart.js. Ứng dụng đọc JSON/GeoJSON tĩnh từ `public/data/` nên có thể chạy ngay với dữ liệu mẫu, không cần API, cơ sở dữ liệu, tệp môi trường hoặc khóa dịch vụ bản đồ.

## Chạy dự án

Chuẩn bị **Node.js 24** kèm npm. Môi trường đã kiểm tra dùng Node.js 24.20.0 và npm 11.19.0. Nếu định đưa mã lên GitHub, cài thêm Git và đăng nhập khi Git yêu cầu.

Mở PowerShell trong thư mục `vietnam-market-intelligence` có `package.json` rồi chạy các lệnh sau.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

Mở [http://localhost:5173/#/map](http://localhost:5173/#/map) hoặc dùng cổng **Local** mà Vite in ra nếu 5173 đang bận. Giữ terminal mở khi dùng. Nhấn `Ctrl+C` để dừng. Trên macOS/Linux, chạy `npm` và `npx` thay cho `npm.cmd` và `npx.cmd`.

### Kiểm thử và xem bản build

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run preview
```

Chạy lệnh cài Chromium lần đầu nếu máy chưa có trình duyệt phù hợp. Bộ kiểm thử E2E cũng hỗ trợ Chrome đã cài trên Windows. Vite tạo bản build trong `dist/`. Mở địa chỉ **Local** do lệnh preview in ra, mặc định là [http://localhost:4173/#/map](http://localhost:4173/#/map), để kiểm tra bản build.

### Cấu trúc dự án

| Thư mục | Nội dung |
|---|---|
| `src/pages/` và `src/components/` | Màn hình, bản đồ, tìm kiếm, biểu đồ và chấm điểm |
| `src/data/` và `src/domain/` | Đọc và kiểm tra dữ liệu, giải quyết chỉ tiêu, lọc và tính điểm |
| `public/data/` | Bộ mẫu sơ đồ và bộ ranh giới mặc định |
| `tests/` | Kiểm thử logic và luồng trình duyệt |
| `scripts/` | Dựng lại bộ ranh giới từ nguồn |

## Dữ liệu

- `public/data/v1-boundaries/` là bộ mặc định, hiển thị 34 tỉnh/thành theo mốc hành chính 01/07/2025. Có ranh giới cho ba phường Ba Đình, Hoàn Kiếm và Sài Gòn. Phạm vi tra cứu cấp xã hiện gồm ba phường này. Các chỉ tiêu thị trường và khảo sát là mô phỏng, chỉ có ở hai thành phố và ba phường mẫu.
- `public/data/v1/` giữ nguyên bộ mẫu sơ đồ từ Mục 2. Chọn **Sơ đồ mẫu** trong mục **Hình học** hoặc mở `/#/map?snapshot=demo`. Cả hai bộ dùng cùng hợp đồng v1. Tệp ranh giới phường của bộ mặc định chỉ được tải khi vào tỉnh/thành tương ứng.

## Thử luồng phân tích

- Từ bản đồ chọn địa bàn và mở **Xem hồ sơ địa bàn**. Hồ sơ cho thấy bối cảnh thị trường, khảo sát Needs & Wants và nguồn theo kỳ.
- Mở `/#/compare?areas=W00004,W00070,W26740` để so sánh ba phường mẫu. Dùng bộ chọn chỉ tiêu để đổi biểu đồ và bấm nhãn nguồn trong bảng để đọc chi tiết.
- Mở `/#/decision?areas=P01,P79`, chọn **Tính điểm** với trọng số mặc định 60/40. TP. Hồ Chí Minh đạt 60 điểm mô phỏng, Hà Nội đạt 40 điểm. Khi đổi trọng số sang 30/70, hai điểm tương ứng là 30 và 70. Mở từng dòng để xem phép tính và tải CSV/JSON. Khi nhập CSV thành bảng, đặt cột `adminCode` ở kiểu văn bản để giữ số 0 đầu.

## Đưa mã nguồn lên GitHub

1. Tạo một repository trống trên GitHub, ví dụ `vietnam-market-intelligence`. Chọn **Public** khi đã rà soát nội dung. Bỏ chọn các mục tạo sẵn README, `.gitignore` và license để lần push đầu khớp lịch sử local.
2. Mở terminal trong **thư mục dự án có `package.json`**, rồi chạy các lệnh sau. Thay `YOUR_USERNAME` và tên repo nếu khác với ví dụ. Sau `git add .`, xem danh sách đang chờ commit rồi mới chạy các lệnh tiếp theo.

```powershell
git init -b main
git add .
git diff --cached --name-only
```

Giữ mã nguồn, `package-lock.json` và dữ liệu mẫu trong `public/data/`. `.gitignore` loại `node_modules/`, `dist/`, kết quả kiểm thử và các tệp môi trường. Trước khi commit, rà soát danh sách để loại thông tin cá nhân, thông tin đăng nhập, dữ liệu khảo sát gốc và tài liệu nộp riêng.

```powershell
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vietnam-market-intelligence.git
git remote -v
git push -u origin main
```

Nếu Git báo thiếu danh tính khi commit, đặt `git config user.name "Tên của bạn"` và `git config user.email "Email GitHub của bạn"` trong repo. Bạn có thể dùng địa chỉ email `noreply` từ phần cài đặt email của GitHub. [Hướng dẫn đưa mã có sẵn lên GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows)

Sau khi repo có trên GitHub, người khác có thể chạy bằng cách clone mã rồi cài phụ thuộc:

```powershell
git clone https://github.com/YOUR_USERNAME/vietnam-market-intelligence.git
cd vietnam-market-intelligence
npm.cmd ci
npm.cmd run dev
```

**Nếu muốn có link demo online**, có thể bật GitHub Pages và dùng GitHub Actions để chạy `npm ci`, `npm run build` và xuất bản `dist/`. URL demo của project site có dạng `https://YOUR_USERNAME.github.io/vietnam-market-intelligence/#/map`. [Hướng dẫn triển khai Vite lên GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)

## Nguồn và giấy phép

Mã nguồn hiện chưa có tệp `LICENSE`. Nếu nhóm muốn cấp quyền sử dụng lại mã, thống nhất giấy phép và thêm `LICENSE` cho phần mã của nhóm. Các lớp dữ liệu địa giới giữ giấy phép của nguồn tương ứng. [Hướng dẫn giấy phép repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)

Đối chiếu 34 mã tỉnh và ba mã phường với danh mục hành chính mốc 01/07/2025. [Quyết định 19/2025/QĐ-TTg](https://vanban.chinhphu.vn/?classid=1&docid=214409&pageid=27160&typegroupid=5)

- Tỉnh lấy từ `vnm_admin1.geojson` thuộc COD-AB v02 của OCHA ROAP/HDX, nguồn Tổng cục Thống kê, được rà soát ngày 25/09/2025. Giấy phép CC BY 3.0 IGO. Giản lược theo đường biên chung tại dung sai 0,0013° và sửa polygon không hợp lệ của An Giang. Kiểm tra hợp lệ sau xử lý, giữ các cấu phần polygon theo nguồn. [Nguồn COD-AB](https://data.humdata.org/dataset/cod-ab-vnm) · [Giấy phép](https://creativecommons.org/licenses/by/3.0/igo/)
- Ba phường lấy từ © OpenStreetMap contributors, giấy phép ODbL 1.0. Dựng polygon từ các đường outer/inner của quan hệ OSM và kiểm tra chúng thuộc tỉnh/thành cha. Đây là ranh giới tham chiếu từ dữ liệu cộng đồng. [Ba Đình](https://www.openstreetmap.org/relation/19331652) · [Hoàn Kiếm](https://www.openstreetmap.org/relation/19331651) · [Sài Gòn](https://www.openstreetmap.org/relation/19260504) · [Giấy phép ODbL](https://www.openstreetmap.org/copyright)

### Dựng lại dữ liệu ranh giới

Phần này dành cho người bảo trì dữ liệu. Chạy demo dùng các tệp GeoJSON đã đóng gói. Script `scripts/build_boundaries.py` cần Python với Shapely 2.1 và hai đầu vào đã đối chiếu ngày 26/11/2026. Tải tệp GeoJSON ZIP từ HDX và lưu dưới tên `cod-vnm.zip`. Với OSM, lưu phản hồi JSON từ truy vấn Overpass dưới tên `osm-2025.json`.

```text
[out:json][timeout:20][date:"2025-09-25T00:00:00Z"];rel(id:19260504,19331651,19331652);out geom;
```

| Tệp | SHA-256 |
|---|---|
| `cod-vnm.zip` | `0a74e8ee18eb84b21f980fa4bd2a3135d2bc42fbd6e31450472368ff48abe41b` |
| `osm-2025.json` | `59885ba3d27894d76ffe0b13b817307cdae35781b3253406b86aa772608d1359` |

Chạy `python scripts/build_boundaries.py cod-vnm.zip osm-2025.json` để dựng lại bộ ranh giới. SHA-256 của phản hồi Overpass cũng phụ thuộc metadata của máy chủ.
