package com.caxcorp.syntra;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
public final class ExportProvider extends ContentProvider {
    public boolean onCreate(){ return true; }
    private File resolve(Uri uri) throws FileNotFoundException {
        if (uri.getPathSegments().size()!=1) throw new FileNotFoundException();
        try {
            File base=new File(getContext().getCacheDir(),"exports").getCanonicalFile();
            File f=new File(base,uri.getLastPathSegment()).getCanonicalFile();
            if(!base.equals(f.getParentFile()) || !f.isFile()) throw new FileNotFoundException();
            return f;
        } catch(IOException e){ throw new FileNotFoundException(); }
    }
    public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if(!"r".equals(mode)) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    public String getType(Uri uri){
        String ext=MimeTypeMap.getFileExtensionFromUrl(uri.toString()).toLowerCase(java.util.Locale.ROOT);
        String type=MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return type==null?"application/octet-stream":type;
    }
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){
        try {
            File f=resolve(uri);String name=f.getName();int cut=name.indexOf('_');if(cut>=0)name=name.substring(cut+1);
            String[] cols=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            Object[] row=new Object[cols.length];for(int i=0;i<cols.length;i++)row[i]=OpenableColumns.SIZE.equals(cols[i])?f.length():OpenableColumns.DISPLAY_NAME.equals(cols[i])?name:null;
            MatrixCursor c=new MatrixCursor(cols);c.addRow(row);return c;
        } catch(FileNotFoundException e){return null;}
    }
    public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
    public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
