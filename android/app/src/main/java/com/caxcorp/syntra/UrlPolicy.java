package com.caxcorp.syntra;
import java.net.URI;
final class UrlPolicy {
    static final String HOME = "https://cax-corp.github.io/dj-resa/";
    static final String ORIGIN = "https://cax-corp.github.io";
    static boolean isApp(String value) {
        try {
            URI u = new URI(value);
            String p = u.getRawPath();
            if (u.getUserInfo() != null || (u.getPort() != -1 && u.getPort() != 443)) return false;
            if (!"https".equalsIgnoreCase(u.getScheme()) || !"cax-corp.github.io".equalsIgnoreCase(u.getHost())) return false;
            // No encoded separators or traversal can escape the application's directory.
            if (p == null || p.indexOf('%') >= 0 || p.indexOf('\\') >= 0) return false;
            if (!p.equals(u.normalize().getRawPath())) return false;
            return "/dj-resa".equals(p) || p.startsWith("/dj-resa/");
        } catch (Exception e) { return false; }
    }
    static boolean isHttps(String value) {
        try { URI u=new URI(value); return "https".equalsIgnoreCase(u.getScheme()) && u.getHost()!=null && u.getUserInfo()==null; }
        catch(Exception e) { return false; }
    }
    static boolean isBlob(String value) { return value != null && (value.startsWith("blob:"+ORIGIN+"/") || value.startsWith("data:")); }
    static String safeName(String name) {
        String clean=(name==null?"document":name).replaceAll("[\\p{Cntrl}/\\\\:*?\"<>|]", "_").trim();
        if (clean.isEmpty() || clean.equals(".") || clean.equals("..")) clean="document";
        return clean.length()>150?clean.substring(0,150):clean;
    }
}
