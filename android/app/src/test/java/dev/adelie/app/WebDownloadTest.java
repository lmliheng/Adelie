package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * 网页里点下载：文件名怎么定、能不能带着 cookie 取回来、出错与超限的时候会不会留下半截文件。
 *
 * <p>用一个真的本地 HTTP 服务（`ServerSocket` 手写三个路径）来试，而不是打在方法上的桩 ——
 * 这段代码的坑全在请求头、状态码和流上。不用 `com.sun.net.httpserver`：单测是编在 android.jar
 * 上的，那套 JDK 专有的类不在里面。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class WebDownloadTest {

    private ServerSocket server;
    private Thread serverThread;
    private volatile String lastCookie = "";
    private String base;
    private File dir;

    @Before
    public void setUp() throws Exception {
        server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        serverThread = new Thread(new Runnable() {
            @Override
            public void run() {
                while (!server.isClosed()) {
                    try {
                        serve(server.accept());
                    } catch (Exception ignored) {
                        // 关服务的时候 accept 会抛，正好结束
                    }
                }
            }
        }, "test-http");
        serverThread.setDaemon(true);
        serverThread.start();
        base = "http://127.0.0.1:" + server.getLocalPort();
        dir = new File(System.getProperty("java.io.tmpdir"),
                "adelie-dl-" + System.nanoTime());
        assertTrue(dir.mkdirs());
    }

    @After
    public void tearDown() throws Exception {
        if (server != null) server.close();
        File[] leftovers = dir.listFiles();
        if (leftovers != null) for (File f : leftovers) f.delete();
        dir.delete();
    }

    /** 一个够用的 HTTP/1.1：读请求行与头，按路径回 200 / 404 / 4 KB 的「大文件」。 */
    private void serve(Socket socket) throws IOException {
        try {
            InputStream in = socket.getInputStream();
            ByteArrayOutputStream head = new ByteArrayOutputStream();
            int b;
            while ((b = in.read()) >= 0) {
                head.write(b);
                byte[] soFar = head.toByteArray();
                int n = soFar.length;
                if (n >= 4 && soFar[n - 4] == '\r' && soFar[n - 3] == '\n'
                        && soFar[n - 2] == '\r' && soFar[n - 1] == '\n') break;
            }
            String text = new String(head.toByteArray(), StandardCharsets.UTF_8);
            String path = text.split("\r\n")[0].split(" ")[1];
            for (String line : text.split("\r\n")) {
                if (line.toLowerCase().startsWith("cookie:")) {
                    lastCookie = line.substring("cookie:".length()).trim();
                }
            }
            OutputStream out = socket.getOutputStream();
            if (path.startsWith("/missing")) {
                out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"
                        .getBytes(StandardCharsets.UTF_8));
            } else if (path.startsWith("/big")) {
                byte[] body = new byte[4096];
                out.write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\n\r\n")
                        .getBytes(StandardCharsets.UTF_8));
                out.write(body);
            } else {
                byte[] body = "pdf-bytes".getBytes(StandardCharsets.UTF_8);
                out.write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\n\r\n")
                        .getBytes(StandardCharsets.UTF_8));
                out.write(body);
            }
            out.flush();
        } finally {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    private String read(File file) throws Exception {
        InputStream in = new FileInputStream(file);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            in.close();
        }
    }

    @Test
    public void theContentDispositionWins() {
        assertEquals("报告.pdf", WebDownload.fileName(base + "/x",
                "attachment; filename=\"报告.pdf\"", "application/pdf"));
        assertEquals("a.pdf", WebDownload.fileName(base + "/x", "attachment; filename=a.pdf", null));
        assertEquals("报告.pdf", WebDownload.fileName(base + "/x",
                "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf", null));
    }

    @Test
    public void otherwiseTheLastPathSegmentIsTheName() {
        assertEquals("report.pdf", WebDownload.fileName(base + "/files/report.pdf?v=3", null, null));
        assertEquals("report final.pdf",
                WebDownload.fileName(base + "/files/report%20final.pdf", "", null));
    }

    @Test
    public void withNothingToGoOnItFallsBackToTheMimeType() {
        assertEquals("adelie-download.pdf", WebDownload.fileName(base + "/", null, "application/pdf"));
        assertEquals("adelie-download.json", WebDownload.fileName(base, null, "application/json"));
        assertEquals("adelie-download", WebDownload.fileName(base, null, "application/x-weird"));
    }

    /** 服务端给的文件名不能带路径：别顺着它写到别的目录去。 */
    @Test
    public void namesAreSanitised() {
        assertEquals("a_b_c", WebDownload.sanitize("a/b\\c"));
        assertEquals("adelie-download", WebDownload.sanitize("   "));
        assertEquals("adelie-download", WebDownload.sanitize(null));
        assertFalse(WebDownload.sanitize("../../etc/passwd").contains("/"));
        String longName = WebDownload.sanitize(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf");
        assertTrue(longName.length() <= 80);
        assertTrue(longName.endsWith(".pdf"));
    }

    @Test
    public void downloadsWithTheCookieAndWritesTheFile() throws Exception {
        File file = WebDownload.fetch(base + "/report.pdf", "adelie=token", "Agent/1.0", dir,
                "report.pdf", WebDownload.MAX_BYTES);

        assertEquals(dir, file.getParentFile());
        assertEquals("pdf-bytes", read(file));
        assertEquals("adelie=token", lastCookie);
    }

    @Test
    public void httpErrorsFailAndLeaveNothingBehind() throws Exception {
        try {
            WebDownload.fetch(base + "/missing", null, null, dir, "missing.txt", 0);
            fail("404 应该抛出来");
        } catch (IOException expected) {
            // 正常：服务端说没有
        }
        assertFalse(new File(dir, "missing.txt").exists());
    }

    /** 超过上限就放弃，并且把下了一半的文件删掉 —— 别让人以为已经下好了。 */
    @Test
    public void tooBigIsAbortedAndTheHalfFileIsGone() throws Exception {
        try {
            WebDownload.fetch(base + "/big", null, null, dir, "big.bin", 1024);
            fail("超过上限应该抛出来");
        } catch (IOException expected) {
            // 正常：自己设的上限
        }
        assertFalse(new File(dir, "big.bin").exists());
    }
}
