package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import dev.adelie.app.control.PhoneControl;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.List;

/**
 * 日志回放的读盘那半边：顺序、条数上限、坏行跳过、统计、清空。
 * 真机上的点按没法在这里复现，但「回放页看到的是不是真的那几条」必须锁住。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private Context ctx;
    private File file;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        File dir = new File(ctx.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        file = new File(dir, "phone-journal.jsonl");
        if (file.exists()) assertTrue(file.delete());
        PhoneControl.clearJournal(ctx);
    }

    private void append(String line) throws Exception {
        try (OutputStream out = new FileOutputStream(file, true)) {
            out.write((line + "\n").getBytes(UTF8));
        }
    }

    private String entry(long t, String action, boolean ok, String error) throws Exception {
        JSONObject o = new JSONObject();
        o.put("t", t);
        o.put("action", action);
        o.put("ok", ok);
        o.put("foreground", "com.tencent.mm");
        if (ok) o.put("step", "点「发送」");
        else o.put("error", error);
        return o.toString();
    }

    @Test
    public void readsEntriesInFileOrder() throws Exception {
        append(entry(1000L, "screen", true, ""));
        append(entry(2000L, "tap", false, "not_found"));
        append(entry(3000L, "text", true, ""));

        List<JSONObject> entries = PhoneControl.journalEntries(ctx, 40);
        assertEquals(3, entries.size());
        assertEquals("screen", entries.get(0).getString("action"));
        assertEquals("text", entries.get(2).getString("action"));
        assertEquals(3000L, entries.get(2).getLong("t"));
    }

    @Test
    public void limitKeepsTheNewest() throws Exception {
        for (int i = 0; i < 10; i++) append(entry(1000L + i, "tap", true, ""));
        List<JSONObject> entries = PhoneControl.journalEntries(ctx, 3);
        assertEquals(3, entries.size());
        assertEquals(1007L, entries.get(0).getLong("t"));
        assertEquals(1009L, entries.get(2).getLong("t"));
    }

    @Test
    public void skipsBrokenLines() throws Exception {
        append(entry(1000L, "screen", true, ""));
        append("{\"t\":2000,\"action\":\"tap\"");
        append("");
        append(entry(3000L, "key", true, ""));

        List<JSONObject> entries = PhoneControl.journalEntries(ctx, 40);
        assertEquals(2, entries.size());
        assertEquals("key", entries.get(1).getString("action"));
    }

    @Test
    public void statsCountFailures() throws Exception {
        append(entry(1000L, "screen", true, ""));
        append(entry(2000L, "tap", false, "not_found"));
        append(entry(3000L, "tap", false, "obstructed"));

        int[] stats = PhoneControl.journalStats(ctx);
        assertEquals(3, stats[0]);
        assertEquals(2, stats[1]);
    }

    @Test
    public void clearRemovesFileAndEntries() throws Exception {
        append(entry(1000L, "screen", true, ""));
        assertFalse(PhoneControl.journalEntries(ctx, 40).isEmpty());

        PhoneControl.clearJournal(ctx);
        assertFalse(file.exists());
        assertTrue(PhoneControl.journalEntries(ctx, 40).isEmpty());
        assertEquals(0, PhoneControl.journalStats(ctx)[0]);
    }

    @Test
    public void labelsAreHumanReadable() {
        assertEquals("读屏", PhoneControl.label("screen"));
        assertEquals("点按", PhoneControl.label("tap"));
        assertEquals("输入文字", PhoneControl.label("text"));
        assertEquals("未知动作", PhoneControl.label("未知动作"));
        assertEquals("", PhoneControl.label(""));
    }
}
