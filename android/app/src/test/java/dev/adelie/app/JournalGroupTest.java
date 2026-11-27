package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import dev.adelie.app.control.PhoneControl;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 日志按轮次分段：读盘那半边由 {@link JournalTest} 锁住，这里只管「怎么切」。
 * 切错了回放页会把两次任务混成一段，排「这次到底点了什么」就白搭。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class JournalGroupTest {

    private JSONObject entry(long t, long task, String action, boolean ok) throws Exception {
        JSONObject o = new JSONObject();
        o.put("t", t);
        o.put("action", action);
        o.put("ok", ok);
        if (task > 0) o.put("task", task);
        return o;
    }

    @Test
    public void sameTaskStaysOneGroup() throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        entries.add(entry(1000, 900, "screen", true));
        entries.add(entry(2000, 900, "tap", true));
        entries.add(entry(3000, 900, "text", true));

        List<PhoneControl.Task> groups = PhoneControl.groupTasks(entries);
        assertEquals(1, groups.size());
        assertEquals(900L, groups.get(0).id);
        assertEquals(3, groups.get(0).size());
        assertEquals(1000L, groups.get(0).first);
        assertEquals(3000L, groups.get(0).last);
    }

    @Test
    public void newTaskStartsNewGroup() throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        entries.add(entry(1000, 900, "screen", true));
        entries.add(entry(2000, 900, "tap", false));
        entries.add(entry(5000, 4000, "open", true));
        entries.add(entry(6000, 4000, "tap", true));

        List<PhoneControl.Task> groups = PhoneControl.groupTasks(entries);
        assertEquals(2, groups.size());
        assertEquals(900L, groups.get(0).id);
        assertEquals(2, groups.get(0).size());
        assertEquals(1, groups.get(0).failed);
        assertTrue(groups.get(0).hasFailure());
        assertEquals(4000L, groups.get(1).id);
        assertEquals(2, groups.get(1).size());
        assertFalse(groups.get(1).hasFailure());
    }

    /** 老版本写的日志没有 task 字段：不能一条一组，也不能跟新一轮混在一起。 */
    @Test
    public void legacyEntriesWithoutTaskShareOneGroup() throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        entries.add(entry(1000, 0, "screen", true));
        entries.add(entry(2000, 0, "tap", true));
        entries.add(entry(9000, 8000, "screen", true));

        List<PhoneControl.Task> groups = PhoneControl.groupTasks(entries);
        assertEquals(2, groups.size());
        assertEquals(0L, groups.get(0).id);
        assertEquals(2, groups.get(0).size());
        assertEquals(8000L, groups.get(1).id);
    }

    /** 中间的「任务」「查日志」这类动作不带轮次标记，会自己成一段，不能并到前面去。 */
    @Test
    public void looseStepsSplitTheRun() throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        entries.add(entry(1000, 900, "tap", true));
        entries.add(entry(1500, 0, "task", true));
        entries.add(entry(2000, 900, "tap", true));

        List<PhoneControl.Task> groups = PhoneControl.groupTasks(entries);
        assertEquals(3, groups.size());
        assertEquals(1, groups.get(1).size());
        assertEquals(0L, groups.get(1).id);
    }

    @Test
    public void countsFailuresPerGroup() throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        entries.add(entry(1000, 900, "tap", false));
        entries.add(entry(2000, 900, "tap", false));
        entries.add(entry(3000, 900, "screen", true));

        List<PhoneControl.Task> groups = PhoneControl.groupTasks(entries);
        assertEquals(1, groups.size());
        assertEquals(3, groups.get(0).size());
        assertEquals(2, groups.get(0).failed);
    }

    @Test
    public void emptyInputGivesNoGroups() {
        assertTrue(PhoneControl.groupTasks(null).isEmpty());
        assertTrue(PhoneControl.groupTasks(Collections.<JSONObject>emptyList()).isEmpty());
    }

    /** 导出读的是磁盘整份：换走的 `.1` 在前、当前的在后，不是回放页那 256 KB 的窗口。 */
    @Test
    public void archivePutsRotatedFileFirst() throws Exception {
        android.content.Context ctx = androidx.test.core.app.ApplicationProvider.getApplicationContext();
        java.io.File dir = new java.io.File(ctx.getFilesDir(), "adelie/data");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        java.io.File current = new java.io.File(dir, "phone-journal.jsonl");
        java.io.File rotated = new java.io.File(dir, "phone-journal.jsonl.1");
        write(rotated, entry(1000, 900, "screen", true) + "\n");
        write(current, entry(2000, 900, "tap", true) + "\n");

        String archive = PhoneControl.journalArchive(ctx);
        String[] lines = archive.split("\n");
        assertEquals(2, lines.length);
        assertEquals("screen", new JSONObject(lines[0]).getString("action"));
        assertEquals("tap", new JSONObject(lines[1]).getString("action"));

        assertTrue(rotated.delete());
        assertTrue(current.delete());
        assertEquals("", PhoneControl.journalArchive(ctx));
    }

    private void write(java.io.File file, String text) throws Exception {
        java.io.OutputStream out = new java.io.FileOutputStream(file, false);
        try {
            out.write(text.getBytes("UTF-8"));
        } finally {
            out.close();
        }
    }

    @Test
    public void journalTextIsOneJsonPerLine() throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        entries.add(entry(1000, 900, "screen", true));
        entries.add(entry(2000, 900, "tap", false));

        String text = PhoneControl.journalText(entries);
        String[] lines = text.split("\n");
        assertEquals(2, lines.length);
        assertEquals("screen", new JSONObject(lines[0]).getString("action"));
        assertEquals("tap", new JSONObject(lines[1]).getString("action"));
        assertTrue(text.endsWith("\n"));
        assertEquals("", PhoneControl.journalText(null));
    }
}
