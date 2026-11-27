package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 导出任务日志：文件名、落盘内容、FileProvider 给的地址、分享意图。
 * 真机上「选中微信能不能收到附件」要人等，但「递出去的是不是那个文件」这里必须锁住。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalExportTest {

    private Context ctx;

    @Before
    public void setUp() throws Exception {
        ctx = ApplicationProvider.getApplicationContext();
        File dir = new File(ctx.getCacheDir(), JournalExport.DIR);
        File[] old = dir.listFiles();
        if (old != null) {
            for (File f : old) assertTrue(f.delete());
        }
        // FileProvider 把「authority → 路径映射」缓在静态字段里，而每个用例的临时目录都不一样，
        // 不清掉的话第二个用例会拿着上一个目录的映射去算相对路径。
        java.lang.reflect.Field cache =
                androidx.core.content.FileProvider.class.getDeclaredField("sCache");
        cache.setAccessible(true);
        Object map = cache.get(null);
        if (map instanceof java.util.Map) ((java.util.Map<?, ?>) map).clear();
    }

    private List<JSONObject> entries(int count) throws Exception {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            JSONObject o = new JSONObject();
            o.put("t", 1000L + i);
            o.put("action", "tap");
            o.put("ok", i != 1);
            o.put("task", 900L);
            out.add(o);
        }
        return out;
    }

    @Test
    public void fileNameCarriesMinuteAndExtension() {
        // 2026-11-27 05:30 Asia/Shanghai
        long t = 1795728600000L;
        String name = JournalExport.fileName(t);
        assertTrue(name, name.startsWith("adelie-journal-"));
        assertTrue(name, name.endsWith(".jsonl"));
        // "adelie-journal-" (15) + "20261127-0210" (13) + ".jsonl" (6)
        assertEquals(34, name.length());
    }

    @Test
    public void writePutsEveryEntryInCacheShare() throws Exception {
        List<JSONObject> list = entries(3);
        File file = JournalExport.write(ctx, list, "adelie-journal-test.jsonl");

        assertTrue(file.isFile());
        assertEquals(new File(ctx.getCacheDir(), JournalExport.DIR), file.getParentFile());
        String text = read(file);
        assertEquals(3, text.split("\n").length);
        assertTrue(text.contains("\"action\":\"tap\""));
    }

    @Test
    public void emptyListStillWritesAnEmptyFile() throws Exception {
        File file = JournalExport.write(ctx, new ArrayList<JSONObject>(), "empty.jsonl");
        assertTrue(file.isFile());
        assertEquals(0, file.length());
    }

    /** 界面上的「导出」走磁盘整份；这里确认它真的把文件里每一行都带过去了。 */
    @Test
    public void writeArchiveTakesWholeFile() throws Exception {
        File dir = new File(ctx.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        File journal = new File(dir, "phone-journal.jsonl");
        java.io.OutputStream out = new java.io.FileOutputStream(journal, false);
        try {
            out.write("{\"t\":1,\"action\":\"screen\",\"ok\":true}\n".getBytes("UTF-8"));
            out.write("{\"t\":2,\"action\":\"tap\",\"ok\":false}\n".getBytes("UTF-8"));
        } finally {
            out.close();
        }
        try {
            File file = JournalExport.writeArchive(ctx, "archive.jsonl");
            String text = read(file);
            assertEquals(2, text.split("\n").length);
            assertTrue(text.contains("\"screen\""));
            assertTrue(text.contains("\"tap\""));
        } finally {
            assertTrue(journal.delete());
        }
    }

    @Test
    public void uriUsesOurFileProviderAuthority() throws Exception {
        File file = JournalExport.write(ctx, entries(1), "adelie-journal-test.jsonl");
        Uri uri = JournalExport.uri(ctx, file);
        assertEquals("content", uri.getScheme());
        assertEquals("dev.adelie.app.files", uri.getAuthority());
        assertTrue(uri.getPath(), uri.getPath().endsWith("adelie-journal-test.jsonl"));
    }

    /** FileProvider 递出去的这个地址真的要能读 —— 收件方只拿得到 content:// 那一串。 */
    @Test
    public void uriCanBeOpenedByReceiver() throws Exception {
        File file = JournalExport.write(ctx, entries(2), "adelie-journal-test.jsonl");
        Uri uri = JournalExport.uri(ctx, file);
        InputStream in = ctx.getContentResolver().openInputStream(uri);
        assertNotNull(in);
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[1024];
        int n;
        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
        in.close();
        assertEquals(read(file), buf.toString("UTF-8"));
    }

    @Test
    public void shareIntentCarriesTheFileAndReadGrant() throws Exception {
        File file = JournalExport.write(ctx, entries(1), "adelie-journal-test.jsonl");
        Uri uri = JournalExport.uri(ctx, file);
        Intent send = JournalExport.share(uri, "adelie-journal-test.jsonl");

        assertEquals(Intent.ACTION_SEND, send.getAction());
        assertEquals("application/json", send.getType());
        assertEquals(uri, send.getParcelableExtra(Intent.EXTRA_STREAM));
        assertEquals("adelie-journal-test.jsonl", send.getStringExtra(Intent.EXTRA_SUBJECT));
        assertTrue((send.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
    }

    private String read(File file) throws Exception {
        byte[] all = new byte[(int) file.length()];
        java.io.FileInputStream in = new java.io.FileInputStream(file);
        try {
            int off = 0;
            while (off < all.length) {
                int n = in.read(all, off, all.length - off);
                if (n < 0) break;
                off += n;
            }
        } finally {
            in.close();
        }
        return new String(all, "UTF-8");
    }
}
