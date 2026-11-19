package com.caxcorp.syntra;
public final class UrlPolicyTest {
    static void check(boolean condition,String name){if(!condition)throw new AssertionError(name);}
    public static void main(String[] args){
        check(UrlPolicy.isApp(UrlPolicy.HOME),"home");
        check(UrlPolicy.isApp(UrlPolicy.HOME+"#/projet/123?tab=planning"),"project hashes survive");
        check(UrlPolicy.isApp("https://cax-corp.github.io/dj-resa"),"root without trailing slash");
        for(String url:new String[]{null,"http://cax-corp.github.io/dj-resa/","https://cax-corp.github.io.evil.test/dj-resa/","https://evil.test@cax-corp.github.io/dj-resa/","https://cax-corp.github.io/other/","https://cax-corp.github.io/dj-resa/../other","https://cax-corp.github.io/dj-resa/%2e%2e/other","https://cax-corp.github.io/dj-resa%2f..%2fother","https://cax-corp.github.io:444/dj-resa/","file:///data/private","javascript:alert(1)"})check(!UrlPolicy.isApp(url),"untrusted: "+url);
        check(UrlPolicy.isBlob("blob:https://cax-corp.github.io/123"),"official blob");
        check(!UrlPolicy.isBlob("blob:https://evil.test/123"),"foreign blob");
        check(!UrlPolicy.isHttps("https://user:pass@evil.test/"),"credentials not propagated");
        check(!UrlPolicy.safeName("../../secret\n.csv").contains("/"),"no traversal in exports");
        check(UrlPolicy.safeName("Plan du lieu.pdf").equals("Plan du lieu.pdf"),"readable file names");
        System.out.println("URL policy: trusted project links, origin boundaries, unsafe schemes, blob origins and export names verified.");
    }
}
