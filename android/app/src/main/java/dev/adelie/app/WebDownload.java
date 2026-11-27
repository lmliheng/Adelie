package dev.adelie.app;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.util.Locale;

/**
 * 网页里点「下载」时，外壳自己把文件取回来。
 *
 * <p>WebView 没有下载能力，`setDownloadListener` 不给实现的话点了就是没反应。这里不用系统的
 * DownloadManager：Adelie 的服务在 127.0.0.1 上、认的是 WebView 里的 cookie，DownloadManager
 * 是另一个进程拿不到；而且它默认往公共 Downloads 写，Android 10 以下还要存储权限。做法跟
 * 「导出任务日志」一样 —— 带着 cookie 自己下一次，落在 cache/share 里，再把文件交给系统分享面板，
 * 发微信、存网盘都行。临时文件在 设置 → 关于 →「临时文件」里看得见、清得掉。
 *
 * <p>上限 {@link #MAX_BYTES}：这是手机上的一个下载，别让它把缓存目录塞满。
 */
final class WebDownload {

    /** 单次下载的上限（64 MB）；超过就放弃，留出空间。 */
    static final long MAX_BYTES = 64L * 1024 * 1024;

    private WebDownload() {
    }

    /**
     * 从 Content-Disposition / URL / MIME 里凑一个文件名。
     * Content-Disposition 最准（服务端愿意给就给），其次是 URL 最后一段，最后按 MIME 猜个后缀。
     */
    static String fileName(String url, String contentDisposition, String mime) {
        String fromHeader = dispositionName(contentDisposition);
        if (fromHeader != null && !fromHeader.isEmpty()) return sanitize(fromHeader);

        String path = "";
        try {
            path = new URL(url).getPath();
        } catch (Exception ignored) {
        }
        if (path != null) {
            int slash = path.lastIndexOf('/');
            String last = slash >= 0 ? path.substring(slash + 1) : path;
            if (!last.isEmpty()) {
                try {
                    last = URLDecoder.decode(last, "UTF-8");
                } catch (Exception ignored) {
                }
                return sanitize(last);
            }
        }
        return sanitize("adelie-download" + extensionFor(mime));
    }

    /** 从 `attachment; filename="报告.pdf"` 里取出文件名；`filename*=UTF-8''…` 也认。 */
    private static String dispositionName(String header) {
        if (header == null || header.isEmpty()) return null;
        String[] parts = header.split(";");
        for (String part : parts) {
            String p = part.trim();
            String lower = p.toLowerCase(Locale.ROOT);
            if (lower.startsWith("filename*=")) {
                String v = p.substring("filename*=".length()).trim();
                int quote = v.indexOf("''");
                if (quote >= 0) v = v.substring(quote + 2);
                try {
                    return URLDecoder.decode(v, "UTF-8");
                } catch (Exception e) {
                    return v;
                }
            }
            if (lower.startsWith("filename=")) {
                String v = p.substring("filename=".length()).trim();
                if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) {
                    v = v.substring(1, v.length() - 1);
                }
                return v;
            }
        }
        return null;
    }

    /** 去掉路径分隔符和控制字符（别让服务端给的文件名写到别的目录里去），太长就截断。 */
    static String sanitize(String name) {
        if (name == null || name.trim().isEmpty()) return "adelie-download";
        String cleaned = name.trim().replace('/', '_').replace('\\', '_').replace('\0', '_');
        StringBuilder sb = new StringBuilder(cleaned.length());
        for (int i = 0; i < cleaned.length(); i++) {
            char c = cleaned.charAt(i);
            if (c < 0x20) continue;
            sb.append(c);
        }
        String out = sb.toString();
        if (out.startsWith(".")) out = "_" + out.substring(1);
        if (out.length() > 80) {
            int dot = out.lastIndexOf('.');
            String ext = dot > 0 && out.length() - dot <= 10 ? out.substring(dot) : "";
            out = out.substring(0, 80 - ext.length()) + ext;
        }
        return out.isEmpty() ? "adelie-download" : out;
    }

    /** 没有文件名可依的时候，按 MIME 给个后缀，免得下回来一堆无扩展名的文件。 */
    static String extensionFor(String mime) {
        if (mime == null) return "";
        String m = mime.toLowerCase(Locale.ROOT).trim();
        if (m.startsWith("text/plain")) return ".txt";
        if (m.startsWith("text/csv")) return ".csv";
        if (m.startsWith("text/markdown")) return ".md";
        if (m.startsWith("text/xml") || m.startsWith("application/xml")) return ".xml";
        if (m.startsWith("image/gif")) return ".gif";
        if (m.startsWith("image/webp")) return ".webp";
        if (m.startsWith("image/svg")) return ".svg";
        if (m.startsWith("text/html")) return ".html";
        if (m.startsWith("application/json")) return ".json";
        if (m.startsWith("application/pdf")) return ".pdf";
        if (m.startsWith("image/png")) return ".png";
        if (m.startsWith("image/jpeg")) return ".jpg";
        if (m.startsWith("image/")) return ".img";
        if (m.startsWith("video/mp4")) return ".mp4";
        if (m.startsWith("video/")) return ".video";
        if (m.startsWith("audio/")) return ".audio";
        if (m.startsWith("application/zip")) return ".zip";
        if (m.startsWith("application/gzip") || m.startsWith("application/x-gzip")) return ".gz";
        if (m.contains("wordprocessingml")) return ".docx";
        if (m.contains("spreadsheetml")) return ".xlsx";
        if (m.contains("presentationml")) return ".pptx";
        if (m.startsWith("application/msword")) return ".doc";
        if (m.startsWith("application/vnd.ms-excel")) return ".xls";
        if (m.startsWith("application/rtf")) return ".rtf";
        return "";
    }

    /**
     * 网页里 `blob:`（`URL.createObjectURL` 出来的内存对象）下载不了 —— 那个地址只在网页的进程里有效。
     * 这段脚本在自己的页面里 fetch 它、读成 base64，再通过 JS 桥交给外壳落盘。
     */
    static String blobScript(String url, String name, String mime) {
        return "(function(){var u=" + jsLiteral(url) + ";var n=" + jsLiteral(name)
                + ";var m=" + jsLiteral(mime == null ? "" : mime) + ";"
                + "fetch(u).then(function(r){return r.blob();}).then(function(b){"
                + "var fr=new FileReader();fr.onload=function(){var s=String(fr.result||'');"
                + "var i=s.indexOf(',');AdelieShell.download(n,(m||b.type||''),s.substring(i+1),b.size);};"
                + "fr.readAsDataURL(b);})"
                + ".catch(function(){try{AdelieShell.downloadFailed();}catch(e){}});})()";
    }

    /** 拼进 JS 字符串字面量的转义（单引号包，别让文件名里的引号把脚本撕开）。 */
    static String jsLiteral(String s) {
        StringBuilder sb = new StringBuilder(s == null ? 2 : s.length() + 8);
        sb.append('\'');
        if (s != null) {
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c == '\\' || c == '\'') sb.append('\\').append(c);
                else if (c == '\n') sb.append("\\n");
                else if (c == '\r') sb.append("\\r");
                else if (c == '<') sb.append("\\u003c");
                else sb.append(c);
            }
        }
        return sb.append('\'').toString();
    }

    /** 把一段字节落成文件（`blob:` / `data:` 两条路都走这里）；超过上限就放弃，不留半截文件。 */
    static File save(byte[] data, File dir, String name, long maxBytes) throws IOException {
        if (data == null) throw new IOException("没有内容");
        if (maxBytes > 0 && data.length > maxBytes) throw new IOException("文件太大");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("建不出目录 " + dir);
        File file = new File(dir, sanitize(name));
        OutputStream out = new FileOutputStream(file, false);
        try {
            out.write(data);
            out.flush();
        } catch (IOException e) {
            out.close();
            if (file.exists() && !file.delete()) {
                // 删不掉也没别的办法
            }
            throw e;
        } finally {
            try {
                out.close();
            } catch (IOException ignored) {
            }
        }
        return file;
    }

    /** base64（JS 的 FileReader 给的没有前缀）→ 文件。 */
    static File saveBase64(String base64, File dir, String name, long maxBytes) throws IOException {
        if (base64 == null || base64.isEmpty()) throw new IOException("没有内容");
        byte[] bytes;
        try {
            bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
        } catch (Exception e) {
            throw new IOException("base64 解不开");
        }
        return save(bytes, dir, name, maxBytes);
    }

    /**
     * 真的去下一份回来：带 cookie（Adelie 的服务认它）和原 UA，落在 dir/name 里。
     * 超过 maxBytes 当场放弃并删掉半截文件，不把缓存目录塞满。
     */
    static File fetch(String url, String cookie, String userAgent, File dir, String name, long maxBytes)
            throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("建不出目录 " + dir);
        File file = new File(dir, sanitize(name));
        HttpURLConnection conn = null;
        InputStream in = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setInstanceFollowRedirects(true);
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
            if (userAgent != null && !userAgent.isEmpty()) {
                conn.setRequestProperty("User-Agent", userAgent);
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
            in = conn.getInputStream();
            OutputStream out = new FileOutputStream(file, false);
            try {
                byte[] buf = new byte[8192];
                long total = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (maxBytes > 0 && total > maxBytes) {
                        throw new IOException("文件太大");
                    }
                    out.write(buf, 0, n);
                }
                out.flush();
            } finally {
                try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
            return file;
        } catch (IOException e) {
            // 下了一半失败：别留下半截文件让人以为下好了
            if (file.exists() && !file.delete()) {
                // 删不掉也没别的办法，下一次同名会覆盖
            }
            throw e;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (IOException ignored) {
                }
            }
            if (conn != null) conn.disconnect();
        }
    }
}
