package dev.adelie.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 应用内检查更新：读发布站的 index.json，跟自己的版本比一比。
 *
 * <p>这个包是侧载的，没有商店帮忙提醒新版本，只能自己看。这里只做两件事：
 * 发现新版本、交给系统的下载器去下。下载与安装都由系统和用户确认，
 * 应用自己不会悄悄装上什么。
 */
final class UpdateCheck {

    /** 发布站（设计站）的下载清单。 */
    static final String INDEX_URL = "http://adelie.lmliheng.work:3003/downloads/index.json";
    /** 清单里 Android 测试包那一块。 */
    static final String TAG = "android-test";

    private static final Pattern VERSION = Pattern.compile("(\\d+)\\.(\\d+)\\.(\\d+)");

    /** 清单里比当前版本新的一行。 */
    static final class Release {
        final String version;
        final String file;
        final String url;
        final long size;
        final String sha256;

        Release(String version, String file, String url, long size, String sha256) {
            this.version = version;
            this.file = file;
            this.url = url;
            this.size = size;
            this.sha256 = sha256;
        }
    }

    private UpdateCheck() {
    }

    /**
     * 从清单里挑出比 {@code currentVersion} 新的一版；没有就返回 null。
     * 认不出清单、版本号缺失、包名不规范，一律当「没有更新」，不打扰人。
     */
    static Release newer(String indexJson, String currentVersion) {
        if (indexJson == null || indexJson.trim().isEmpty()) return null;
        JSONObject root;
        try {
            root = new JSONObject(indexJson);
        } catch (Exception e) {
            return null;
        }
        JSONArray versions = root.optJSONArray("versions");
        if (versions == null) return null;
        for (int i = 0; i < versions.length(); i++) {
            JSONObject block = versions.optJSONObject(i);
            if (block == null || !TAG.equals(block.optString("tag"))) continue;
            JSONArray files = block.optJSONArray("files");
            if (files == null || files.length() == 0) return null;
            JSONObject file = files.optJSONObject(0);
            if (file == null) return null;
            String name = file.optString("name", "");
            String version = versionOf(name);
            if (version.isEmpty()) return null;
            if (compare(version, currentVersion) <= 0) return null;
            String url = file.optString("url", "");
            if (url.isEmpty()) return null;
            return new Release(version, name, url, file.optLong("size", 0),
                    file.optString("sha256", ""));
        }
        return null;
    }

    /** 从文件名里抠版本：`adelie-android-arm64-1.0.14-beta.apk` → `1.0.14`。 */
    static String versionOf(String text) {
        if (text == null) return "";
        Matcher m = VERSION.matcher(text);
        return m.find() ? m.group(1) + "." + m.group(2) + "." + m.group(3) : "";
    }

    /** a 比 b 新返回正数，相等 0，更旧负数；只比前三段数字，`-beta` 这类后缀不参与。 */
    static int compare(String a, String b) {
        int[] x = parts(a);
        int[] y = parts(b);
        for (int i = 0; i < 3; i++) {
            if (x[i] != y[i]) return x[i] > y[i] ? 1 : -1;
        }
        return 0;
    }

    private static int[] parts(String version) {
        int[] out = new int[3];
        String text = version == null ? "" : version;
        Matcher m = VERSION.matcher(text);
        String digits = m.find() ? m.group(0) : text;
        String[] bits = digits.split("\\.");
        for (int i = 0; i < Math.min(3, bits.length); i++) {
            try {
                out[i] = Integer.parseInt(bits[i].trim());
            } catch (NumberFormatException ignored) {
                out[i] = 0;
            }
        }
        return out;
    }

    /** 同步读清单（调用方在后台线程）；超时短一点，没网的时候别让人干等。 */
    static String fetch(String url) throws IOException {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Cache-Control", "no-cache");
            int code = conn.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            try (InputStream in = conn.getInputStream();
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return new String(out.toByteArray(), "UTF-8");
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * 交给系统下载器：带通知栏进度，下完点通知就能装。
     * 放公共 Downloads 目录，用户也能自己去文件管理器里找到。
     */
    static long download(Context ctx, Release release) {
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) throw new IllegalStateException("这台机器没有下载服务");
        DownloadManager.Request req = new DownloadManager.Request(resolve(release.url));
        req.setTitle("Adelie " + release.version);
        req.setDescription("正在下载 Adelie " + release.version + " 更新包");
        req.setMimeType("application/vnd.android.package-archive");
        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, release.file);
        req.addRequestHeader("Accept-Encoding", "identity");
        return dm.enqueue(req);
    }

    /** 清单里的地址是站内相对路径，补上发布站域名；绝对地址原样用。 */
    static Uri resolve(String url) {
        String text = url == null ? "" : url.trim();
        if (text.contains("://")) return Uri.parse(text);
        if (text.startsWith("/")) return Uri.parse("http://adelie.lmliheng.work:3003" + text);
        return Uri.parse("http://adelie.lmliheng.work:3003/" + text);
    }

    /** 人看的大小：12.3 MiB。 */
    static String sizeText(long bytes) {
        if (bytes <= 0) return "";
        double mib = bytes / 1024.0 / 1024.0;
        return String.format(java.util.Locale.US, "%.1f MiB", mib);
    }
}
