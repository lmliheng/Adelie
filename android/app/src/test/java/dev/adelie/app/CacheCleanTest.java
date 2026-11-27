package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.List;

/**
 * 「临时文件」的算账与清理：只认 cache 下的 photos / videos / share 三个目录，
 * 应用自己的数据（解包出来的 Adelie、对话、任务日志）一个字节都不能碰 ——
 * 这个「清理」按钮要是会顺手删掉用户的东西，那就不该存在。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CacheCleanTest {

    private Context ctx;

    @Before
    public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        CacheClean.clear(ctx);
    }

    private File write(String dir, String name, int bytes) throws Exception {
        File root = new File(ctx.getCacheDir(), dir);
        assertTrue(root.isDirectory() || root.mkdirs());
        File file = new File(root, name);
        OutputStream out = new FileOutputStream(file, false);
        try {
            out.write(new byte[bytes]);
        } finally {
            out.close();
        }
        return file;
    }

    private CacheClean.Part part(String dir) {
        for (CacheClean.Part p : CacheClean.parts(ctx)) {
            if (p.dir.equals(dir)) return p;
        }
        throw new AssertionError("没有这一类：" + dir);
    }

    @Test
    public void eachFolderIsCountedOnItsOwn() throws Exception {
        write(CacheClean.DIR_PHOTOS, "shot-1.jpg", 300);
        write(CacheClean.DIR_PHOTOS, "shot-2.jpg", 200);
        write(CacheClean.DIR_VIDEOS, "clip-1.mp4", 1000);

        List<CacheClean.Part> parts = CacheClean.parts(ctx);
        assertEquals(3, parts.size());
        assertEquals(2, part(CacheClean.DIR_PHOTOS).files);
        assertEquals(500, part(CacheClean.DIR_PHOTOS).bytes);
        assertEquals(1, part(CacheClean.DIR_VIDEOS).files);
        assertEquals(1000, part(CacheClean.DIR_VIDEOS).bytes);
        assertEquals(0, part(CacheClean.DIR_SHARE).files);
        assertEquals(1500, CacheClean.totalBytes(ctx));
        assertEquals(3, CacheClean.totalFiles(ctx));
    }

    @Test
    public void emptyCacheSaysZero() {
        assertEquals(0, CacheClean.totalBytes(ctx));
        assertEquals(0, CacheClean.totalFiles(ctx));
        assertEquals(0, CacheClean.clear(ctx));
    }

    @Test
    public void sizesReadLikeSizes() {
        assertEquals("0 B", CacheClean.human(0));
        assertEquals("0 B", CacheClean.human(-5));
        assertEquals("512 B", CacheClean.human(512));
        assertEquals("1.0 KB", CacheClean.human(1024));
        assertEquals("2.5 KB", CacheClean.human(2560));
        assertEquals("3.0 MB", CacheClean.human(3L * 1024 * 1024));
        assertEquals("1.5 GB", CacheClean.human((long) (1.5 * 1024 * 1024 * 1024)));
    }

    /** 清理只动那三个目录：别的地方放的文件（包括 Adelie 的数据目录、cache 根下的别的文件）都得留着。 */
    @Test
    public void clearingLeavesEverythingElseAlone() throws Exception {
        File photo = write(CacheClean.DIR_PHOTOS, "shot.jpg", 400);
        File clip = write(CacheClean.DIR_VIDEOS, "clip.mp4", 600);
        File share = write(CacheClean.DIR_SHARE, "journal.jsonl", 100);

        // 不该被清的两样：cache 根下别人放的文件，和应用自己的数据目录
        File keepInCache = new File(ctx.getCacheDir(), "keep.txt");
        OutputStream out = new FileOutputStream(keepInCache, false);
        out.write(new byte[64]);
        out.close();
        File data = new File(ctx.getFilesDir(), "adelie/data");
        assertTrue(data.isDirectory() || data.mkdirs());
        File journal = new File(data, "phone-journal.jsonl");
        OutputStream jout = new FileOutputStream(journal, false);
        jout.write("{\"action\":\"读屏\"}\n".getBytes("UTF-8"));
        jout.close();

        assertEquals(1100, CacheClean.clear(ctx));

        assertFalse("照片该被清掉", photo.exists());
        assertFalse("录像该被清掉", clip.exists());
        assertFalse("导出的日志该被清掉", share.exists());
        assertTrue("cache 根下的文件不是我们放的，别动", keepInCache.exists());
        assertTrue("任务日志是用户的数据，不能清", journal.exists());
        assertEquals(0, CacheClean.totalBytes(ctx));
    }
}
