package dev.adelie.app;

import android.content.Context;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * 「临时文件」：网页里拍的照片、录的录像、导出来的任务日志都先落在 cacheDir 下的
 * {@code photos / videos / share} 三个目录里，交完就没人管了 —— 安卓只在空间紧张时
 * 才会来回收，于是一次次拍照录像能攒出几百兆，而设置里看不出是谁占的。
 *
 * <p>这里只认这三个目录：应用自己的数据（解包出来的 Adelie、对话记录、任务日志）
 * 一个字节都不碰，所以「清理」永远不可能把用户的会话清掉。
 */
final class CacheClean {

    /** 三个放临时文件的地方，和写它们的那几处（MainActivity / JournalExport）一一对应。 */
    static final String DIR_PHOTOS = "photos";
    static final String DIR_VIDEOS = "videos";
    static final String DIR_SHARE = "share";
    private static final String[] DIRS = {DIR_PHOTOS, DIR_VIDEOS, DIR_SHARE};

    /** 某一类临时文件现在有几个、多大。 */
    static final class Part {
        final String dir;
        int files;
        long bytes;

        Part(String dir) {
            this.dir = dir;
        }
    }

    private CacheClean() {
    }

    /** 三个目录各算一份（没建过的目录就是 0 个 0 字节）。 */
    static List<Part> parts(Context ctx) {
        List<Part> out = new ArrayList<>();
        File cache = ctx.getCacheDir();
        for (String dir : DIRS) {
            Part part = new Part(dir);
            File root = new File(cache, dir);
            File[] files = root.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.isFile()) {
                        part.files++;
                        part.bytes += f.length();
                    }
                }
            }
            out.add(part);
        }
        return out;
    }

    /** 一共占多少：列表里那一行显示的就是它。 */
    static long totalBytes(Context ctx) {
        long sum = 0;
        for (Part part : parts(ctx)) sum += part.bytes;
        return sum;
    }

    static int totalFiles(Context ctx) {
        int sum = 0;
        for (Part part : parts(ctx)) sum += part.files;
        return sum;
    }

    /** 清掉三类临时文件，返回腾出来的字节数。只删这三个目录里的文件，目录本身留着。 */
    static long clear(Context ctx) {
        long freed = 0;
        File cache = ctx.getCacheDir();
        for (String dir : DIRS) {
            File root = new File(cache, dir);
            File[] files = root.listFiles();
            if (files == null) continue;
            for (File f : files) {
                if (!f.isFile()) continue;
                long length = f.length();
                if (f.delete()) freed += length;
            }
        }
        return freed;
    }

    /** 「没有」/「812 B」/「12.3 KB」/「8.4 MB」—— 列表里一行放得下，也看得出量级。 */
    static String human(long bytes) {
        if (bytes <= 0) return "0 B";
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format(java.util.Locale.ROOT, "%.1f KB", kb);
        double mb = kb / 1024.0;
        if (mb < 1024) return String.format(java.util.Locale.ROOT, "%.1f MB", mb);
        return String.format(java.util.Locale.ROOT, "%.1f GB", mb / 1024.0);
    }
}
