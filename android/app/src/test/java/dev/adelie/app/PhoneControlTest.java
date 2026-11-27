package dev.adelie.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import dev.adelie.app.control.ControlServer;
import dev.adelie.app.control.PhoneControl;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.Charset;

/**
 * 手机操控的协议层：无障碍没开时要老实报错，本地控制口的鉴权与响应也要对。
 * 真正的点按/读屏要在真机上验证，这里只锁住「不开权限也不会炸、不会乱跑」这部分。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class PhoneControlTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    @After
    public void tearDown() {
        ControlServer.stop();
    }

    @Test
    public void statusReportsAccessibilityOffWhenServiceIsDown() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "status"));
        assertTrue(out.getBoolean("ok"));
        assertFalse(out.getBoolean("accessibility"));
    }

    @Test
    public void screenWithoutAccessibilityExplainsWhatToDo() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "screen"));
        assertFalse(out.getBoolean("ok"));
        assertEquals("accessibility_off", out.getString("error"));
        assertTrue(out.getString("message").contains("手机操控"));
    }

    @Test
    public void waitWithoutAccessibilitySaysWhatToDoInsteadOfSleeping() throws Exception {
        long start = System.currentTimeMillis();
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "wait")
                .put("text", "已发送").put("timeout", 3000));
        long spent = System.currentTimeMillis() - start;

        assertFalse(out.getBoolean("ok"));
        assertEquals("accessibility_off", out.getString("error"));
        assertTrue("没读屏能力就别干等：" + spent, spent < 1500);
    }

    @Test
    public void unknownActionIsRejected() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "fly"));
        assertFalse(out.getBoolean("ok"));
        assertEquals("bad_request", out.getString("error"));
    }

    @Test
    public void helpListsTheActions() throws Exception {
        JSONObject out = PhoneControl.handle(new JSONObject().put("action", "help"));
        String help = out.getString("help");
        assertTrue(help.contains("screen"));
        assertTrue(help.contains("tap"));
    }

    @Test
    public void controlServerAnswersWithToken() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        ControlServer.start(context);
        assertTrue(ControlServer.running());
        assertTrue(ControlServer.port() > 0);
        assertTrue(ControlServer.portFile().exists());

        String body = "{\"action\":\"status\"}";
        String response = post(ControlServer.port(), ControlServer.token(), body);
        assertTrue(response.startsWith("HTTP/1.1 200"));
        JSONObject json = new JSONObject(payload(response));
        assertTrue(json.getBoolean("ok"));
        assertFalse(json.getBoolean("accessibility"));
    }

    @Test
    public void controlServerRejectsWrongToken() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        ControlServer.start(context);

        String response = post(ControlServer.port(), "not-the-token", "{\"action\":\"status\"}");
        assertTrue(response.startsWith("HTTP/1.1 401"));
        assertEquals("unauthorized", new JSONObject(payload(response)).getString("error"));
    }

    private static String post(int port, String token, String body) throws Exception {
        Socket socket = new Socket("127.0.0.1", port);
        try {
            socket.setSoTimeout(5000);
            byte[] bytes = body.getBytes(UTF8);
            String head = "POST /cmd HTTP/1.1\r\n"
                    + "Host: 127.0.0.1\r\n"
                    + "X-Adelie-Token: " + token + "\r\n"
                    + "Content-Type: application/json\r\n"
                    + "Content-Length: " + bytes.length + "\r\n"
                    + "Connection: close\r\n\r\n";
            OutputStream out = socket.getOutputStream();
            out.write(head.getBytes(UTF8));
            out.write(bytes);
            out.flush();

            InputStream in = socket.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        } finally {
            socket.close();
        }
    }

    private static String payload(String response) {
        int split = response.indexOf("\r\n\r\n");
        return split < 0 ? "" : response.substring(split + 4);
    }
}
