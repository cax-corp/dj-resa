#!/usr/bin/env python3
"""Build with the official Android SDK and ECJ, then sign with an external private key.
The ordinary Gradle project can also be opened directly in Android Studio.
"""
import argparse, pathlib, subprocess, zipfile, xml.etree.ElementTree as ET
p=argparse.ArgumentParser()
p.add_argument('--sdk',type=pathlib.Path,required=True)
p.add_argument('--ecj',type=pathlib.Path,required=True)
p.add_argument('--keystore',type=pathlib.Path,required=True)
p.add_argument('--password-file',type=pathlib.Path,required=True)
p.add_argument('--output',type=pathlib.Path,required=True)
a=p.parse_args();root=pathlib.Path(__file__).resolve().parent
build=root/'app/build/standalone';build.mkdir(parents=True,exist_ok=True)
for name in ['classes','generated','dex']:(build/name).mkdir(exist_ok=True)
tools=a.sdk.resolve()/'build-tools/35.0.0';android=a.sdk.resolve()/'platforms/android-35/android.jar'
def run(*args):subprocess.run([str(x) for x in args],check=True)
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
m=ET.parse(root/'app/src/main/AndroidManifest.xml');m.getroot().set('package','com.caxcorp.syntra');m.write(build/'AndroidManifest.xml',encoding='utf-8')
run(tools/'aapt2','compile','--dir',root/'app/src/main/res','-o',build/'resources.zip')
run(tools/'aapt2','link','-o',build/'resources.apk','--manifest',build/'AndroidManifest.xml','-I',android,'--java',build/'generated','--min-sdk-version','26','--target-sdk-version','35','--version-code','1','--version-name','1.0.0','--auto-add-overlay',build/'resources.zip')
sources=list((root/'app/src/main/java').rglob('*.java'))+list((build/'generated').rglob('*.java'))
run('java','-jar',a.ecj.resolve(),'-8','-encoding','UTF-8','-warn:none','-classpath',android,'-d',build/'classes',*sources)
with zipfile.ZipFile(build/'classes.jar','w',zipfile.ZIP_DEFLATED) as z:
 for f in (build/'classes').rglob('*.class'):z.write(f,f.relative_to(build/'classes'))
run('java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','26','--lib',android,'--output',build/'dex',build/'classes.jar')
with zipfile.ZipFile(build/'resources.apk') as original,zipfile.ZipFile(build/'unsigned.apk','w',zipfile.ZIP_DEFLATED) as z:
 for name in original.namelist():z.writestr(name,original.read(name))
 for f in (build/'dex').glob('*.dex'):z.write(f,f.name)
 for f in (root/'app/src/main/assets').rglob('*'):
  if f.is_file():z.write(f,'assets/'+str(f.relative_to(root/'app/src/main/assets')))
run(tools/'zipalign','-f','4',build/'unsigned.apk',build/'aligned.apk')
a.output.resolve().parent.mkdir(parents=True,exist_ok=True)
run('java','-jar',tools/'lib/apksigner.jar','sign','--ks',a.keystore.resolve(),'--ks-key-alias','syntra','--ks-pass','file:'+str(a.password_file.resolve()),'--out',a.output.resolve(),build/'aligned.apk')
run('java','-jar',tools/'lib/apksigner.jar','verify','--verbose',a.output.resolve())
print('APK signé :',a.output.resolve())
