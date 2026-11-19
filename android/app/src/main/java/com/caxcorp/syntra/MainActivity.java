package com.caxcorp.syntra;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int PICK_FILES=10, SAVE_FILE=11;
    private static final long MAX_FILE=64L*1024*1024;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final HashMap<String,Transfer> transfers=new HashMap<>();
    private FrameLayout root;
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorView;
    private ValueCallback<Uri[]> fileCallback;
    private File saveFile;
    private String script, currentUrl=UrlPolicy.HOME;
    private volatile int generation;
    private WebMessagePort port;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private boolean dark, failed, printing, screensaver;
    private final java.util.ArrayDeque<Export> saveQueue=new java.util.ArrayDeque<>();
    private static final class Export {
        final File file; final String name,mime;
        Export(File f,String n,String m){file=f;name=n;mime=m;}
    }
    private static final class Transfer {
        File file; OutputStream output; String name,mime;long expected,received;boolean open;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        dark=(getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
        dark=getPreferences(MODE_PRIVATE).getBoolean("site-dark",dark);
        root=new FrameLayout(this); setContentView(root);
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v,insets)->{
                Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                Insets ime=insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom));return insets;
            });
        }
        try(InputStream input=getAssets().open("native.js")){script=new String(readAll(input),java.nio.charset.StandardCharsets.UTF_8);}
        catch(Exception e){script="";}
        web=new WebView(this);
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        configure();
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.GRAY));
        root.addView(progress,new FrameLayout.LayoutParams(-1,dp(2),Gravity.TOP));
        createErrorView();setThemeColours(dark);
        io.execute(()->{
            File dir=exportDir();File[] files=dir.listFiles();
            if(files!=null)for(File f:files)if(System.currentTimeMillis()-f.lastModified()>2L*24*60*60*1000)f.delete();
        });
        if(state==null || web.restoreState(state)==null)web.loadUrl(startUrl(getIntent()));
    }
    private byte[] readAll(InputStream in)throws Exception{
        ByteArrayOutputStream result=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
        while((n=in.read(buffer))!=-1)result.write(buffer,0,n);return result.toByteArray();
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private File exportDir(){File f=new File(getCacheDir(),"exports");f.mkdirs();return f;}
    private String startUrl(Intent intent){String url=intent==null?null:intent.getDataString();return UrlPolicy.isApp(url)?url:UrlPolicy.HOME;}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);web.loadUrl(startUrl(intent));}
    private void configure(){
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(true);s.setTextZoom(100);
        s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString()+" SyntraAndroid/1.0");
        if(Build.VERSION.SDK_INT>=29)s.setForceDark(WebSettings.FORCE_DARK_OFF);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return navigate(request.getUrl().toString());}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){
                disconnect();setScreensaver(false); failed=false;printing=false;progress.setVisibility(View.VISIBLE);errorView.setVisibility(View.GONE);
                if(UrlPolicy.isApp(url))currentUrl=url;
            }
            @Override public void onPageFinished(WebView view,String url){
                progress.setVisibility(View.GONE);
                if(!failed && UrlPolicy.isApp(url))connect();
                CookieManager.getInstance().flush();
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())showError();}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)showError();}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                disconnect();root.removeView(web);web.destroy();web=new WebView(MainActivity.this);root.addView(web,0,new FrameLayout.LayoutParams(-1,-1));configure();showError();return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);}
            @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){
                if(!UrlPolicy.isApp(url))return false;
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){
                if(!UrlPolicy.isApp(url))return false;
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Confirmer",(d,w)->result.confirm()).setNegativeButton("Annuler",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!UrlPolicy.isApp(web.getUrl())){callback.onReceiveValue(null);return true;}
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
                java.util.ArrayList<String> types=new java.util.ArrayList<>();
                for(String type:params.getAcceptTypes()){
                    for(String item:type.split(",")){
                        item=item.trim();if(item.startsWith(".")){String mime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(item.substring(1));if(mime!=null)item=mime;}
                        if(item.contains("/"))types.add(item);
                    }
                }
                if(!types.isEmpty())intent.putExtra(Intent.EXTRA_MIME_TYPES,types.toArray(new String[0]));
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try{startActivityForResult(intent,PICK_FILES);}catch(ActivityNotFoundException e){fileCallback.onReceiveValue(null);fileCallback=null;notice("Aucun sélecteur de fichiers disponible.");}
                return true;
            }
            @Override public boolean onCreateWindow(WebView v,boolean dialog,boolean gesture,android.os.Message message){
                if(!gesture)return false;
                WebView child=new WebView(MainActivity.this);
                child.setWebViewClient(new WebViewClient(){
                    private boolean handled;
                    private void handle(String url){if(handled)return;handled=true;if(UrlPolicy.isApp(url))web.loadUrl(url);else external(url);ui.post(child::destroy);}
                    @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){handle(r.getUrl().toString());return true;}
                    @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){if(!"about:blank".equals(url))handle(url);}
                });
                ((WebView.WebViewTransport)message.obj).setWebView(child);message.sendToTarget();return true;
            }
            @Override public void onShowCustomView(View view,CustomViewCallback callback){
                if(fullscreen!=null){callback.onCustomViewHidden();return;}
                fullscreen=view;fullscreenCallback=callback;root.addView(view,new FrameLayout.LayoutParams(-1,-1));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if(Build.VERSION.SDK_INT>=30){getWindow().getInsetsController().hide(WindowInsets.Type.systemBars());}
                else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
            }
            @Override public void onHideCustomView(){leaveFullscreen();}
        });
        web.setDownloadListener((url,agent,disposition,mime,length)->{
            if(UrlPolicy.isBlob(url)){openBlob(url,false);return;}
            if(!UrlPolicy.isHttps(url)){notice("Ce lien de téléchargement n’est pas pris en charge.");return;}
            String name=URLUtil.guessFileName(url,disposition,mime);
            notice("Préparation du fichier…");io.execute(()->downloadHttps(url,name,mime));
        });
    }
    private boolean navigate(String url){
        if(UrlPolicy.isApp(url))return false;
        if(UrlPolicy.isBlob(url)&&UrlPolicy.isApp(web.getUrl())){openBlob(url,true);return true;}
        external(url);return true;
    }
    private void external(String value){
        try{
            Uri uri=Uri.parse(value);String scheme=uri.getScheme();
            if(!java.util.Arrays.asList("https","http","mailto","tel","geo").contains(scheme))return;
            startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));
        }catch(Exception e){notice("Aucune application ne peut ouvrir ce lien.");}
    }
    private void openBlob(String url,boolean open){
        if(!UrlPolicy.isApp(web.getUrl()))return;
        if(open)web.evaluateJavascript("window.__syntraOpenDocument&&window.__syntraOpenDocument("+JSONObject.quote(url)+")",null);
        else web.evaluateJavascript("(()=>{let a=document.createElement('a');a.href="+JSONObject.quote(url)+";a.download='document';a.click()})()",null);
    }
    private void disconnect(){
        generation++;
        if(port!=null){try{port.close();}catch(Exception ignored){}port=null;}
        io.execute(()->{for(Transfer t:transfers.values()){try{t.output.close();}catch(Exception ignored){}t.file.delete();}transfers.clear();});
    }
    private void connect(){
        if(script.isEmpty()||port!=null||!UrlPolicy.isApp(web.getUrl()))return;
        final int session=generation;
        web.evaluateJavascript(script,ignored->{
            if(session!=generation||!UrlPolicy.isApp(web.getUrl()))return;
            WebMessagePort[] pair=web.createWebMessageChannel();port=pair[0];
            pair[0].setWebMessageCallback(new WebMessagePort.WebMessageCallback(){
                @Override public void onMessage(WebMessagePort source,WebMessage message){
                    if(session!=generation||!UrlPolicy.isApp(web.getUrl()))return;
                    try{
                        JSONObject data=new JSONObject(message.getData());String type=data.optString("type");
                        if("theme".equals(type)){setThemeColours(data.optBoolean("dark"));return;}
                        if("clipboard".equals(type)){
                            String text=data.optString("text");if(text.length()>100000)return;
                            ((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Syntra",text));
                            JSONObject ack=new JSONObject();ack.put("seq",data.optInt("seq"));source.postMessage(new WebMessage(ack.toString()));return;
                        }
                        if("print".equals(type)){printPage();return;}
                        if("screensaver".equals(type)){setScreensaver(data.optBoolean("active"));return;}
                        if("notice".equals(type)){notice(data.optString("message","Fichier indisponible."));return;}
                        io.execute(()->receive(data,source,session));
                    }catch(Exception e){notice("Le fichier n’a pas pu être préparé.");}
                }
            });
            web.postWebMessage(new WebMessage("syntra-native-connect",new WebMessagePort[]{pair[1]}),Uri.parse(UrlPolicy.ORIGIN));
        });
    }
    private void receive(JSONObject data,WebMessagePort source,int session){
        if(session!=generation)return;
        String id=data.optString("id"),type=data.optString("type");JSONObject reply=new JSONObject();
        try{
            reply.put("seq",data.optInt("seq"));
            if(id.length()>100)throw new Exception("Transfert invalide.");
            if("file-start".equals(type)){
                long size=data.getLong("size");if(size<0||size>MAX_FILE||transfers.size()>=4||transfers.containsKey(id))throw new Exception("Fichier trop volumineux ou transfert déjà en cours.");
                Transfer t=new Transfer();t.name=UrlPolicy.safeName(data.optString("name"));t.mime=safeMime(data.optString("mime"));
                t.file=new File(exportDir(),UUID.randomUUID()+"_"+t.name);t.output=new FileOutputStream(t.file);t.expected=size;t.open=data.optBoolean("open");transfers.put(id,t);
            }else if("file-chunk".equals(type)){
                Transfer t=transfers.get(id);if(t==null)throw new Exception("Transfert interrompu.");
                String encoded=data.getString("data");if(encoded.length()>270000)throw new Exception("Bloc de fichier trop volumineux.");
                byte[] bytes=android.util.Base64.decode(encoded,android.util.Base64.DEFAULT);
                if(t.received+bytes.length>t.expected)throw new Exception("Fichier incomplet.");t.output.write(bytes);t.received+=bytes.length;
            }else if("file-end".equals(type)){
                Transfer t=transfers.remove(id);if(t==null)throw new Exception("Transfert interrompu.");
                t.output.close();if(t.received!=t.expected){t.file.delete();throw new Exception("Fichier incomplet.");}
                ui.post(()->{if(session!=generation){t.file.delete();return;}if(t.open)openExport(new Export(t.file,t.name,t.mime));else queueSave(new Export(t.file,t.name,t.mime));});
            }else throw new Exception("Action non reconnue.");
        }catch(Exception e){
            Transfer t=transfers.remove(id);if(t!=null){try{t.output.close();}catch(Exception ignored){}t.file.delete();}
            try{reply.put("error",e.getMessage()==null?"Échec du transfert.":e.getMessage());}catch(Exception ignored){}
        }
        ui.post(()->{if(session==generation&&source==port)try{source.postMessage(new WebMessage(reply.toString()));}catch(Exception ignored){}});
    }
    private String safeMime(String mime){return mime!=null&&mime.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+")?mime:"application/octet-stream";}
    private void queueSave(Export export){saveQueue.add(export);if(saveFile==null)saveNext();}
    private void saveNext(){
        Export next=saveQueue.poll();if(next==null)return;saveFile=next.file;
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(next.mime).putExtra(Intent.EXTRA_TITLE,next.name);
        try{startActivityForResult(i,SAVE_FILE);}catch(Exception e){saveFile=null;next.file.delete();notice("Impossible d’ouvrir l’enregistrement.");saveNext();}
    }
    private void openExport(Export export){
        Uri uri=new Uri.Builder().scheme("content").authority(getPackageName()+".exports").appendPath(export.file.getName()).build();
        Intent i=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,export.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.setClipData(ClipData.newRawUri(export.name,uri));
        try{startActivity(i);}catch(ActivityNotFoundException e){queueSave(export);}
    }
    private void downloadHttps(String value,String name,String mime){
        File f=null;
        try{
            String url=value;HttpURLConnection connection=null;
            for(int i=0;i<6;i++){
                if(!UrlPolicy.isHttps(url))throw new Exception();
                connection=(HttpURLConnection)new URL(url).openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(30000);
                String cookies=CookieManager.getInstance().getCookie(url);if(cookies!=null)connection.setRequestProperty("Cookie",cookies);
                int code=connection.getResponseCode();
                if(code>=300&&code<400){String target=connection.getHeaderField("Location");String next=new URL(new URL(url),target).toString();connection.disconnect();url=next;continue;}
                if(code<200||code>=300)throw new Exception();break;
            }
            if(connection==null||connection.getResponseCode()/100!=2)throw new Exception();
            if(connection.getContentLengthLong()>MAX_FILE)throw new Exception();
            String clean=UrlPolicy.safeName(name);f=new File(exportDir(),UUID.randomUUID()+"_"+clean);
            try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(f)){
                byte[] buffer=new byte[32768];int n;long size=0;while((n=in.read(buffer))!=-1){size+=n;if(size>MAX_FILE)throw new Exception();out.write(buffer,0,n);}
            }finally{connection.disconnect();}
            final Export export=new Export(f,clean,safeMime(mime));ui.post(()->queueSave(export));
        }catch(Exception e){if(f!=null)f.delete();ui.post(()->notice("Le téléchargement a échoué ou dépasse 64 Mo."));}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_FILES&&fileCallback!=null){
            Uri[] values=null;
            if(result==RESULT_OK&&data!=null){
                if(data.getClipData()!=null){ClipData clip=data.getClipData();values=new Uri[clip.getItemCount()];for(int i=0;i<values.length;i++)values[i]=clip.getItemAt(i).getUri();}
                else if(data.getData()!=null)values=new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(values);fileCallback=null;
        }
        if(request==SAVE_FILE&&saveFile!=null){
            File f=saveFile;saveFile=null;
            Uri destination=result==RESULT_OK&&data!=null?data.getData():null;
            io.execute(()->{
                try{
                    if(destination!=null)try(InputStream in=new java.io.FileInputStream(f);OutputStream out=getContentResolver().openOutputStream(destination)){
                        if(out==null)throw new Exception();byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
                        ui.post(()->notice("Fichier enregistré."));
                    }
                }catch(Exception e){ui.post(()->notice("Le fichier n’a pas pu être enregistré."));}
                finally{f.delete();ui.post(this::saveNext);}
            });
        }
    }
    private void printPage(){
        if(printing||!UrlPolicy.isApp(web.getUrl()))return;printing=true;
        PrintManager manager=(PrintManager)getSystemService(PRINT_SERVICE);
        final PrintDocumentAdapter delegate=web.createPrintDocumentAdapter("Syntra");
        PrintDocumentAdapter adapter=new PrintDocumentAdapter(){
            @Override public void onStart(){delegate.onStart();}
            @Override public void onLayout(android.print.PrintAttributes oldA,android.print.PrintAttributes newA,android.os.CancellationSignal c,LayoutResultCallback cb,Bundle e){delegate.onLayout(oldA,newA,c,cb,e);}
            @Override public void onWrite(android.print.PageRange[] pages,android.os.ParcelFileDescriptor file,android.os.CancellationSignal c,WriteResultCallback cb){delegate.onWrite(pages,file,c,cb);}
            @Override public void onFinish(){delegate.onFinish();printing=false;web.evaluateJavascript("window.dispatchEvent(new Event('afterprint'))",null);}
        };
        try{manager.print("Syntra",adapter,null);}catch(Exception e){printing=false;notice("L’impression n’est pas disponible.");web.evaluateJavascript("window.dispatchEvent(new Event('afterprint'))",null);}
    }
    private void setThemeColours(boolean value){
        dark=value;getPreferences(MODE_PRIVATE).edit().putBoolean("site-dark",value).apply();int color=Color.rgb(value?25:255,value?25:255,value?25:255);
        root.setBackgroundColor(color);web.setBackgroundColor(color);getWindow().setStatusBarColor(color);getWindow().setNavigationBarColor(color);
        if(Build.VERSION.SDK_INT>=30){WindowInsetsController c=getWindow().getInsetsController();if(c!=null)c.setSystemBarsAppearance(value?0:WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}
        else getWindow().getDecorView().setSystemUiVisibility(value?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }
    private void setScreensaver(boolean active){
        screensaver=active;
        if(active){
            ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if(Build.VERSION.SDK_INT>=30){getWindow().getInsetsController().hide(WindowInsets.Type.systemBars());getWindow().getInsetsController().setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}
            else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else if(fullscreen==null){
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if(Build.VERSION.SDK_INT>=30)getWindow().getInsetsController().show(WindowInsets.Type.systemBars());
            setThemeColours(dark);
        }
    }
    private void leaveFullscreen(){
        if(fullscreen==null)return;root.removeView(fullscreen);fullscreen=null;
        if(fullscreenCallback!=null){fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;}
        setScreensaver(screensaver);
    }
    private void createErrorView(){
        errorView=new LinearLayout(this);errorView.setOrientation(LinearLayout.VERTICAL);errorView.setGravity(Gravity.CENTER);errorView.setPadding(dp(32),dp(32),dp(32),dp(32));errorView.setBackgroundColor(Color.rgb(17,17,17));
        TextView title=new TextView(this);title.setText("Syntra");title.setTextColor(Color.WHITE);title.setTextSize(30);title.setTypeface(null,android.graphics.Typeface.BOLD);errorView.addView(title);
        TextView detail=new TextView(this);detail.setText("Connexion indisponible\nVérifiez votre connexion puis réessayez.");detail.setTextColor(Color.LTGRAY);detail.setGravity(Gravity.CENTER);detail.setPadding(0,dp(16),0,dp(24));errorView.addView(detail);
        Button retry=new Button(this);retry.setText("Réessayer");retry.setTextColor(Color.BLACK);retry.setAllCaps(false);
        GradientDrawable bg=new GradientDrawable();bg.setColor(Color.WHITE);bg.setCornerRadius(dp(5));retry.setBackground(bg);retry.setPadding(dp(24),dp(12),dp(24),dp(12));retry.setOnClickListener(v->web.loadUrl(currentUrl));errorView.addView(retry);
        root.addView(errorView,new FrameLayout.LayoutParams(-1,-1));errorView.setVisibility(View.GONE);
    }
    private void showError(){failed=true;progress.setVisibility(View.GONE);errorView.setVisibility(View.VISIBLE);}
    private void notice(String message){Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
    @Override public void onBackPressed(){
        if(fullscreen!=null){leaveFullscreen();return;}
        web.evaluateJavascript("(()=>{const s=document.getElementById('syntra-screensaver');if(s&&!s.hidden){s.click();return true}return false})()",value->{
            if("true".equals(value))return;if(web.canGoBack())web.goBack();else super.onBackPressed();
        });
    }
    @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
    @Override protected void onPause(){web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();web.onResume();}
    @Override protected void onDestroy(){
        disconnect();if(fileCallback!=null)fileCallback.onReceiveValue(null);web.destroy();io.shutdown();super.onDestroy();
    }
}
