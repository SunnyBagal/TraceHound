// The running wolf in snow (mono dot matrix): ported from Visuals/wolf-loader/wolf-snow-mono.html.
// One canvas, no dependencies; one still frame under prefers-reduced-motion.
//
//   const loader = createSnowWolfMono(canvas, { cell: 2, background: '#0e0e13' });
//   loader.destroy();
const WOLF_DATA = {"cols":226,"rows":93,"fps":12.5,"groundSpeed":18.5,"levels":10,"contacts":[{"frame":1,"foot":"hind-near","x":87.0,"y":91},{"frame":2,"foot":"hind-far","x":108.5,"y":90.5},{"frame":4,"foot":"front-far","x":180.5,"y":90.5},{"frame":5,"foot":"front-near","x":183.5,"y":91}],"frames":[" 6a| 6a| 48:7 1v| 48:J5:3 1t| 48:J3=2J2:c 1i| 44:5J3=3Jc:4 1f| 43:2J5=2J=3Je:2 1e| 3z:5J4=4J2=3Je:3 1c| 3x:3J8=6Jg=J2:2 1b| 3w:2Jb=2J=3Jd=2*=2J:3 19| 3w:Je=2Je=*5=J2:e w| 3s:5Jd=2Jg=2*=2Je=2:2 v| 3r:2Jg=2JcI4J3=J3I2J9=5: v| 2o:10 3:Jh=2J8IaJ3Id=5: v| 2i:7Jy:5Jh=I3J4Is=4J: v| 2g:3J1q=2I10=2J: v| 2f:2J1rI=2Iz=2J:2 v| 2c:4J1rI2=2ImH8I5=2J: w| 28:5J1i=2J7I5=2IhHeI2=3J:2 w| 27:2J1n=2J4I8=H3IcH7=dJ2: x| 26:2J1o=2IcH2=2I7HbI=J7=4J2:2 x| 24:3J1oI2=2IbH2=3He=dJ4:2 y| 23:2J1oI4=2IcH2=3Hc=3Ja=J2:3 z| 22:2J1mI8=IcH4=4H8=2J=J:6J3:4 11| 21:2JtI12=2IaH7=2H8I=J:3 4:5 14| 1z:3JlI1c=2I6HkJ2:2 1f| 1y:2JlI1e=2I4Hl=2:2 1g| 1x:2JkI1h=IHnI=:2 1h| 1u:4JeI1o=2Hn=J: 1i| 1s:3JcIf=I1bH2=2HmJ2:2 1i| 1q:3JcIh=2I16H7=HlIJ:2 1j| 1p:2JaIl=3I14HtIJ:2 1k| 1n:3J8Ip=3I10HbG2HiIJ:2 1l| 1l:3J8Is=3InH3I5HfG2HhIJ:2 1m| 1j:3J7I3=Is=3IdHx=HfIJ2:2 1n| 1g:4J5I6=2It=3I8H11=2HdIJ2:2 1o| 1d:4J5I9=2Iu=3I4H14=2HG7H4IJ2:2 1p| 18:6J6Ib=2IqH5=2H16GH=2G9H2IJ2:2 1q| v:eJ8Ie=2InH9=2H14G2H=2G9H2J2:2 1r| r:5JiIh=2IHbI3Hi=HrGHaG5=2G8H2J2:2 1s| p:3JhIm=2HyGHpG2H9G6=2G7H=2J:2 1t| o:2JbIrHI=3Hz=HoG3H7G7=2G6H=3J: 1u| n:2J3IvH2IH3=4Hz=2HlG7H4G8=2G6=3J:2 1u| l:3J2IvH8=4Hz=2HkG8H2Ga=2G3=4J2:2 1v| k:2J3IoHgJ4H10G2HgGn=2G2H=3J:3 1w| j:2J3IjH2I2HhJ2:3H10G3H9G7=2GnH=J3:2 1y| i:2J2IiHnJ2:2 :H10G4H7G4=6GnIJ:4 1z| i:J2I2J5I9HoIJ2:2 2:2HzGe=2GrHJ:2 22| i:JIJ8I=2JI2HpIJ2:2 4:HzG16HJ:2 23| i:2J3:6J2=4HoIJ2:2 5:2GHrG4HG4:3Gu=5HJ:2 24| j:5 4:4J=6HkJ2:2 7:2HIJHnGaI:4GFGp=2H=3J2: 25| v:2=2HnIJ:2 9:2J2IHjGdI: 2:4Gl=7J3:2 25| w:2H5=3I6H2=4GHIJ2:2 b:4H2GHeGg: 4:JGi=4FG=2J2:4 26| x:3J4=dGHIJ2:2 f:3HG2HcGg:2 3:IGg=3F4G=2:3 29| z:6J9=2I2J2:3 i:2IHI3H8GhI: 2:2Gf=3F6G=J: 2b| 14:aJ4:3 l:3J3IH6GiI: 2:IGe=2F9HJ: 2b| 1d:6 p:4J=8GfH2:2 :IGcH=3F9GJ: 2b| 2b:HG2F5=3GcH3J: :GcHJ2=2F9HJ: 2b| 2b:GF7G=2HGbH3J:3GbHJ:2J=F9HJ: 2b| 2a:2F8=3JGdHI:2IGaIJ:4GF8GJ2: 2b| 29:2HF7G=J2:2HGcHJ:IG9IJ:2 2:F9GJ2: 2b| 28:2H2F7G=2:5GbHJ:G9IJ:2 3:FaJ2: 2b| 27:2H2F8G=J: 3:2GaHIJHG7HJ:2 4:2F2EF3EF2HJ: 2b| 26:2H2FaHJ: 4:2GaHJG7HJ:2 6:F2E2FE3FGJ: 2b| 25:2H2FcG:3 3:2GiIJ: 7:2FE7FI: 2b| 25:H2FeHI:4 :GhHJ:2 8:FE3FE2F2I: 2b| 25:HFfGH4:4GgIJ: 9:F2EF6H: 2b| 25:GFhG2H4I=3GdJ:2 9:2F8G:2 2a| 25:G2F6E3FaG3H=3GdJ: b:2F7HJ: 2a| 25:2HG2=3Fk=2GbHI: c:F7GJ: 2a| 26:H3=H=F=3F7E3F7=2GaH:2 c:F6EFI: 2a| 26:5H2=2H=4F=3Fb=G9HI:2 c:2FEF2E2FI: 2a| 2a:5IH3=3H=7F5=2G5F2GHIJ:2 c:FE5FH: 2a| 2e:8I3H=H=3F5=2G4F2GHIJ2: 9:4F2E4FG:2 29| 2l:6H3=F6=G4F2GHI2J: 7:3J3G=E5FI:2 28| 2q:4GF6=2G7H3: 5:3H=I3=2FE4F=I:2 27| 2p:7=5F=G7=G2: 3:3G2H=5FE4F2=I2: 27| 2l:5H6=F=F=4G5=3G:5G4E2F2E8F=GI: 27| 2k:2G=H8G5=F=G6=2F:2G5EeF=G2: 27| 2j:2H=2H2Gb=4G6=2H2G3EgF=2:2 27| 2i:2H2=FGd=2F=2G3F3=3FEhF=2F: 28| 2i:H2F=2Ga=9G=2F4=3Ee=4G:2 28| 2i:HF3=3FG3=8F2=7F5=3Eb=2F2G2: 29| 2i:2F4=cFGF4=Fb=4E6F=2F3G:2 29| 2j:2F4=5G2F5GF7:3F5GF3=F7=FGFG2: 2a| 2k:3F4=F3GF3:b :3F=2FGF=2F7=FG3:2 2a| 2m:e d:2F=5F2EF5=FG3: 2b| 3e:3F=FE5F2=3G3:2 2b| 3g:3E4F=4F2G2:2 2c| 3i:4F2=F5:3 2d| 3l:a 2f| 6a| 6a"," 6a| 6a| 6a| 4c:5 1t| 4b:2J3:3 1r| 4b:J6:7 1l| 44:8Jc:7 1f| 43:2J8=J2I2Jc:4 1c| 43:J8=2I6Jd:3 1a| 3v:9J9=I2HI4Je:2 19| 3u:2JhI2H2=2I2Jf:2 18| 3q:5JjI3=2IJe=J2:2 17| 3p:2JnI2=2IJd=2*=2J:3 15| 3k:6JoI=2IJaI2J=*5=J2:3 13| 2u:rJsI2=I2J4I8J2=2*=2J5:5 z| 2o:7J1hIjJ3=J3I2J6:7 t| 2k:5J1mI3H2IhJ3I6Ja:2 s| 2g:5J1nI7=IuJ3=2J=:2 r| 2d:4J1lId=Ix=2J=2: r| 2b:3J1fIJ3=2Ig=IwH2=4: r| 29:3J1fI6=2Ig=2HIuH3=2J: r| 27:3J1eIa=2IfH=2HIfHbI3H2I=J2: r| 25:3J1eId=2IfH=2IbHjI=J2:2 r| 24:2J1cIh=2Ig=3H5I3H9=5H4I2=3J:2 s| 22:3J1bIk=2IfH=2Hh=H3=9J2: t| 21:2J12Iw=HIdHg=bH=5J:3 t| 20:2JpI1a=H3I2Hn=4J8=J=J4:2 v| 1z:2JmI1dHt=2Ja:4J2:3 w| 1x:3JgI1bHc=Ho=3J2:9 2:4 y| 1w:2JgI1cHd=2Hm=2J2:3 1c| 1v:2JcI1dHi=2HlJ2:3 1e| 1t:3J9Ii=ItHo=HkJ2:2 1g| 1s:2J9Ij=2IsHp=HiIJ2:2 1h| 1q:3J3:J4Im=ImHd=2HhGHgIJ2:2 1i| 1p:2J5:J2Io=IeHl=2HhGHfJ3:2 1j| 1n:3J5:2JIp=I8Hs=HhGHdIJ2:3 1k| 1l:3J4I3:2IoH2=H10GHuIJ2:2 1m| 1k:2J4I5:JIlH5=H10G2HsJ2:3 1n| 1i:3J3I7:JIiH8=H10G2HoGHIJ2:2 1p| 1g:3J3I9:IeHd=H10G2HpIJ2:2 1q| 1d:4J4Ia:IaHh=H1qJ2:3 1r| w:iJ5Ic:I6Hl=H10GHkGH=2J2:2 1t| q:7JkIe:I2Hp=HyG3HhG2H2=3J:2 1u| n:4JnIh:JIHp=2HwG4HfG3H=3J2:2 1v| k:4J9IqH8:2IHp=6GHpG5H9G2H3G2=G=4J2:2 1w| i:3J6ItHb:2IHp=F2G2=5G2HiG=2G4H9G6=4J3:3 1x| g:3J5IuHaIJ:3IHoG=F8=5G3HbG=3Gj=4J2:3 1z| g:J=5J2IpHeJ2: :HpG=Fc=3G4H8G=2Gg=5G=2:3 21| g:2J2=8IkHeIJ2:2 :HoG2=Fe=3G3H7Gh=3GF3G=2:2 22| h:4J6=3H2IeHeI=J2:2 2:G2HbGd=Ff=2H2GHaGe=GF7GH:2 21| k:7J=2H3I2HI9He=3J:2 3:2G2H3Gj=2Ff=3JI2J2IJ5IHGc=2F9H2:3 1z| q:J=H8I2Hj=2J2:2 5:G4HGj=Fg=2J:3J9HGb=2FbH2I:2 1y| q:2IH3=2I7HaG3H2=2J3:2 6:2G3H3Gh=FgGIJ: :aGd=FcH2I:2 1x| r:4J2=8I4=6G3=3J2:3 8:Gm=2FhGH: a:Gd=Fb=2FH2:2 1w| u:4J3=eH2I=J2:3 a:HGl=FiGI: a:2Gc=3F8=4FH2:3 1u| x:5Jh:3 c:2Gl=FiG=: b:G9HG3=3F6=2G2=F2G2H:2 1t| 11:j f:GjH2=Fi=2:2 a:GcH=J=GF4=2H2=2F3G2H:3 1r| 1z:2GhHJ2HFi=J2: a:2GbHJ:3GF3=GH=2F6H3:2 1q| 20:GgHIJ:3Fh=2J: b:2GbH:4G3=G2=F8HGH:3 1o| 20:F2GdHJ2:2 :2HGFfGI: c:GbHJ: :3=2H=2FaG2H:2 1n| 20:FGdHIJ:2 3:4FfG: c:2GbJ: 3:3H=GFbG2H:3 1l| 1z:2GeIJ:2 7:2FeG:2 c:GbI: 5:3HG2FbGH2: 1l| 1y:2IGdIJ:2 9:2HG2FaGJ: c:2GaH:2 6:4HG2F9H2:2 1k| 1x:2I2GcHJ:2 b:4HGF9I: d:2G9HJ: 9:3HG2F8GJ: 1k| 1x:I2GcHI:2 f:3GF8G:2 d:2G9J: b:3HGF6G=2: 1k| 1w:2IGcHI:2 i:2F8GJ: e:G9H: d:3GF5=2J: 1k| 1v:2IGcHI:2 k:GF8I: e:2G8H:2 d:2GF4G=J:2 1k| 1v:I2GaHI:3 l:2GF7G:2 e:2G8J: b:3HF5=2J: 1l| 1v:HGbHI: o:2F7=2:2 e:G8J: a:2G3F4=2J:2 1l| 1u:2GbH:3 p:2F6=2J:2 d:2G8:2 7:3G3F4G=J:2 1m| 1u:HGaH:2 s:2F2E2F2=J2: b:4G8J: 6:2G3E3F3=2J: 1n| 1t:2HG9H:2 u:2E3F2=2J: 9:3I:2G8J: 5:2HG2FE3F2G=2:2 1n| 1t:HG9HI: w:E4F2=H:4 5:2I2H3G8H:2 4:H2F2E4F2=2J: 1o| 1t:HG9H2: w:2E2F3=4H: 4:2I3GI2G8HJ: 2:3HF2E5F=2J:2 1o| 1t:GaH2: x:E2F4G=2H:2 :3I2GeJ:4I2GF3E4=2IJ: 1p| 1t:Gc: x:2EF8H:3I3GgI5HF4E2F=2GHI: 1p| 1t:2=2G6=G2: y:F9H2:H2IGhI4GF8=G3:2 1p| 1u:F=2G5=2G:2 x:2F5=2F2H2=GaF4G8:2F8=G:3 1q| 1u:2F=G5=3H:2 x:F3=5F2H=4Gi:4F7:3 1s| 1v:2=3G3=4H:2 w:2F=2G2=2F5=2Gh:2 2:9 1u| 1w:F2=G4=4H:3 v:F=G2=2F4E2=2G3:f 26| 1w:2F=2G4=5H:2 u:2=G2=F8=2G2I:2 2i| 1x:2F=2G4=F2H3:2 u:FG2=F9=2GH2: 2i| 1y:2F=2F3=4FG2:3 s:2G2=3F7=2F2H: 2i| 1z:2F=3F4=2FG3:3 r:G4=5F3=2F3: 2i| 20:2F2=2F4=6G:3 p:2G6F=6F3: 2i| 21:2F2=F6=6G:2 p:3G5F3=2F3:2 2i| 22:2F=8F=4GH:2 q:4G3F5:3 2j| 23:2F5=2F3=2F2=H:2 s:a 2l| 24:2F3=bH2: 3n| 25:4FG2F5G4:2 3n| 28:4F9: 3o| 2b:b 3o"," 6a| 6a| 6a| 6a| 6a| 6a| 42:5 7:3 1t| 3y:5J3:4 3:2J:4 1q| 3r:8Ja:5J5:3 1o| 3r:Jn=2J=J2:4 1l| 3n:5Jm=3J=3J3:8 1e| 3j:5Jv=2J=3J6:5 1a| 3b:9J10IJ2=3J9:4 17| 2y:eJ18I3J2=2Jb:3 15| 2r:8J1lI3=J3=2Jb:2 14| 2m:6J15=3JkI3=2J2=2Jc:3 12| 2h:6J1b=2JlI3=4Jf:2 11| 2e:4J1h=2JkI3=2JeIJ3:2 10| 2b:4J1l=3Jj=3IJbI2J3=J2:2 z| 29:3J1p=2Ji=3IeJ2=2*=2J:2 y| 26:4J1nI5=3Ig=2IfJ=*5=J:2 x| 24:3J1mIa=2If=2IgJ2=2*=2J3:4 u| 22:3J1mId=2Ie=3IgJ3=J8:4 r| 20:3J1iIk=2IdH=2IiJ3I4J6:3 p| 1y:3J17I2JIu=3Id=2IsJ5:5 l| 1x:2J13I14=3Ic=2H2IsHJ5=:2 k| 1w:2JuI1f=2IcH=H2IrH4=5: k| 1s:3 :JpI1l=3IbH2=H2IiHd=4: k| 1r:2J:3JjI1t=IHIaH=2H2IcHj=2J: k| 1p:3J2:2JeI1vH4=2H2I9H=3Hv=2J:2 k| 1o:2J3:2J9I1wHa=HaIH3=3Hf=4HaJ2:2 l| 1n:2J3:2J6I1nHn=2He=2H5I=6I3=G2=9HIJ:2 m| 1m:2J4:J6I1iHt=2Hj=dHGH=4G2=3J2: n| 1k:3J4:2JIqHIpH1i=5Jd=2J2=I2=J3:2 n| 1j:2J5:2JIqH3IhH17G2HfI=2J3:fJ7:3 o| 1i:2J5:2J2IpH1sG2HeIJ3:4 d:9 q| 1g:3J6:2JIpH17G2HkGHdIJ3:3 1f| 1f:2J3I3J2:2JInH1aG3HhG2HaIJ4:3 1h| 1c:4J3I5:3JIgH1iG3HgG2H5=4J3:4 1j| 19:4J4I7:2JIcHeGH19G3HfG2H4=2G=2J:3 1m| 14:6J6I8:J2I8HhG2H1aG2HeG2H4=2G2=2J: 1o| y:7J8Ib:JI7Hj=GH19G2HeG5=3GF2=2I:2 1n| r:8JbId:JI6Hk=2H19G2HfG2=4GF7H:2 1m| h:bJdIhJ:JHpG=H19G3Hf=3G2F9H2:3 1k| g:2JhIn=2IHoG3H7G=4H=3I2HqG3Hf=2GFdH3:2 1j| g:JbIrH2I=2IHnG=2G3=7G2=9HmG4Hh=GFeGH2:3 1h| g:2HIvH7I=2IHmG=7G3F6G=2J5I=3HiG4HfG2:2FgH3:3 1f| h:2IJ2IoHb=3IHm=2FfG=J:5J3=4IHeG4HfG2:3G2FeG2H2:3 1d| i:2J2ImHc=3HmG2=FgG=2: 3:4J4=dI=2G3H6G3H5G3:5GFfGH3:2 1c| j:3IH3IfHf=2HfG2H2G5=2FhGJ: 6:5J5=cH6GdH:2 :2GFgH3:2 1b| l:3I3=IcHf=2HdGH2G8=2FiGI: a:6JbIHG2H3GdI2:5GFhH2:3 19| n:3I=2IHo=3HcG2H5G4=2FjGJ: f:dHGjI3:3GFiH3:3 17| p:2H=5HsG2H2GH2G3H5G3=2FjG=2: r:3HG3HGeI3:3FjH4:3 15| q:2=2HGHI3J2I6=3HG8H5G6HG3H4G3H=2GFiG=J: t:3H2IH2GeHI:2GFkHG3:4 12| r:2JI2=hGmH3GH2=2J=2Fi=2J: v:2J3IH2GdHI:2GFlG5:4 z| s:5Je=2GnH4=2J3=FhG=J:2 w:3J2IH2GdI3:GH5G2FfG5H:4 w| w:fJ=2GlH3=2J2:3GFh=2J: z:3I2H4GbI3:5J4HG2FeG3H3:3 u| 19:2J=HGjH3=3J2:2 :2FgG=J:2 11:3I4HGcI2:2 :7HGFgG5:2 t| 16:4IGmH=3J2:3 3:GFf=2J: 14:3J2HGdIH:2 6:3H2GFgG3:6 o| 14:3IH2IGlH2IJ2:3 5:3FdG=2:2 16:4HGdIH:3 6:4H2G2FeGH2G3:5 2:5 d| 13:2I5GkH2IJ:4 9:GFc=2J: 1a:3G2H3G8H3:2 8:4HG2FdH2G5H2:4H3:3 b| 12:2JI2GkH2I2J:3 c:GFb=2J:2 1c:3I3H2G7H2I:2 a:5G2FfG8H2G3:2 a| 12:I2HGeHG3H3I2:4 e:HGF9=2IJ: 1f:2J3IG9IJ: e:3HGFhG4F3GH2: a| 11:2IGdH=4H2I2:4 h:2GF9=HI:2 1g:3JIHG9I: g:4H3GFjGHJ: a| 11:IGc=4I4:4 l:GF9=I:2 1j:3IG9H:2 i:4JHGFaEF5=3:2 a| 10:2IGc=2I3:4 n:2Fa=I: 1m:3G8HJ: l:4GFe=2J:2 b| 10:IGcHI2:4 q:IF9=2I: 1o:2G7I:2 o:3G3F3=8J2: c| z:2IGaHI2:3 t:IGF5E2F=HI: 1p:G6HJ: r:3IH3=J=2J=2J2:2 c| z:IGaHI:3 v:2F5E3F=HI: 1p:G6I:2 t:5J:9 d| z:IG7:6 x:2F6EF2=I:2 1m:4G5HJ: y:3 l| y:2G7:2 12:HF8=2I: 1k:4H3G4HJ:2 1m| y:HG7: 13:IF8=HI:2 1i:2H5IG4J2: 1n| y:HG5F:2 13:GF8=HIJ: 1h:2H=2HG6IJ:2 1n| x:2G6F: 14:GF8=H:3 1g:2H=4G6J:2 1o| x:HG6:2 14:F9=H:3 1g:H2F3=2G=2GHI: 1p| w:2HG4=G: 15:F9=HI2: 1g:2F5=5H2: 1p| w:HG4=2:2 15:F9=GI2:2 1g:F6=2G3H: 1p| v:2HG4=F: 16:2F8=2G2H: 1g:3F4=G3:3 1p| v:HG5=F: 17:F9=3H:2 1h:a 1r| v:HG4=2F: 17:2Fa=3:3 3g| v:G5=F2: 18:F6=3F3=H2:2 3f| u:2G5=F2: 18:2F4=4FEF=3H:4 3c| u:HG3=3F2: 19:2F2=4F2E5GH3:3 3a| u:HFG=4F=: 1a:2=2G=2F2E6G5:4 37| u:2F2=F2=3:2 1a:3G2=2F2E8G5:3 35| v:=3F=2F2H: 1c:2GF=3EaG4H:3 33| v:F4=F3=:3 1b:3F2=FEcG=H2: 33| v:F4=5G2:2 1c:2F=F3Eb=3:2 32| v:2F8G3: 1d:3F5E9F=FH: 32| w:2F9H: 1f:3F4=aFH: 32| x:2F9: 1h:5Fb:2 32| y:b 1l:7F4:2 33| 30:6 34"," 6a| 6a| 6a| 6a| 6a| 42:5 23| 42:J3:5 1z| 3v:8J7:3 :4 1s| 3r:5Jg:3J2:3 2:3 1l| 3r:Jr:4J:3 1j| 3o:4Ju=2J2:3 1h| 3l:4Ju=7J2:3 1f| 3c:aJy=7J3:3 1d| 37:6J17=aJ2:3 1b| 31:7J1c=6J2=3J3:4 18| 2w:6J1i=2I2=3Ja:3 16| 2p:8J1o=2I3=2I2J9:3 14| 2i:8J1pI3J2I=2IH2I3=2Ja:3 12| 2d:6J1hIm=2H3I=3IJ3I4J4:3 10| 28:6J1iIrH4=3IbJ4:2 z| 24:5J1kIc=IiH2=3IeJ3: z| 21:4J1iIh=3Ii=2IeJ3=J:2 y| 1z:3J1gIn=3Ig=2IeJ2=2*=2:2 x| 1y:2J17Iz=2If=2IfJ=*5=:3 v| 1x:2JxI1b=2Ie=H2IeJ2=2*=2J3:3 t| 1x:JtI1g=3IcH=2HIfJ3=J7:4 q| 1q:5 :2JnI1n=2IcH=2HIhJ3H4J5:5 m| 1m:5J3:3JhI1v=2IbH=2H2IfHaJ7:3 k| 1k:3J6:2JdI1yH4=2H2I7H2=2H5I2H3IHjJ3=J=:2 j| 1i:3J7:2JaI1qH3IHd=2Hb=2Hw=4:2 i| 1h:2J7:3J7I1mHp=2Hb=3Hv=5: i| 1f:3J7:3J5I1hHy=Hc=2Hw=2J:2 i| 1d:3J8:3J3I1cH16=Hc=2Hw=2J: j| 1c:2J9:5JIrH2I5H1lGHeGH9I7=6H8IJ2:2 j| 1a:3Ja:3J2IrH=H1rG2Hj=cJ=dJ:2 k| 19:2Jb:3J3InHIH2=2H1s=HhI=2Ja=3J=IH4=3J2:2 l| 17:3J3I6J2:2J3IiHa=2H15GHn=HbI2=2IJ5:cJ7=J2:3 m| 16:2J3I8J:3J2IgHd=2H15G2Hm=H8=6J3:5 a:c o| 15:2J3I9J: :2IcHhGH18G=2Hk=H5=5J4:4 1e| 13:3J2IbJ:3JI8HkG2H1a=2Hj=H3=H=2J3:5 1h| 11:3J3Id:2J2I6HlG3H1bG3HhG2=5J:4 1l| 10:2J4Id:2J2IHq=2GH1dG3Hg=3G2=2J: 1o| y:3J3Ie:3JI2Hp=3H1eG3Hg=GF2G=2J: 1o| u:5J3If:3JIHp=9H1bG3Hf=2F3G=2: 1o| r:4J6Id:4J3Hp=2GF4G2=3J2I7HzG5HeG=F3GHI:2 1n| o:4J7Ia=3J:J6HoG=2F7G=2J:4J8I2HuG6HdG=F5GI: 1n| k:5J6I2=gJ5HmG4=2F8G=2:2 2:4J8I2HtG7HaG=GF5I:2 1m| g:5J7I4=dH4JHnG6=2F9=2J: 6:7J6IHqG8H4G3HG2=2F6I:2 1l| g:J8I6=3HIH10G6=2F9G=2:2 c:4J5IJ=8I2H2I6H6Gi=2F5HI:2 1k| g:J4IHI4H2=4HsG9H2G5=2F9G=2J: g:6J8=iH2Gh=2F5H2:3 1i| g:2H3I4H3=4HqGg=4Fa=2J:2 l:9JjHGi=2F5H3:3 1g| h:3I=4I=4H13G2=4FcG=J2: u:kHGj=3F4G3H:3 1e| j:3J2=5HeI4=pFf=2J:2 1c:2Gm=2F5G2HG:3 1c| l:3J=2HcI2=9Ji=2FgG=J:2 1d:IGn=3F5G4:3 1a| m:2J2Ha=6J7:iJ=2FfG=2J: 1e:HGp=2F6G3H:3 18| k:3IHc=2J4:8 g:IHGFf=2J:2 1e:2GH4Gl=3F6G4:4 15| d:3 2:3I3G3HGH3IJ5:5 l:3Fh=2J:2 1g:2I2JI2H6G5H2G9=3F6G4H:3 13| 8:6J:4I4G6H2IJ3:4 o:2H2FfG=2J2: 1i:2J7I2H4G3HGb=3F6G5:3 11| 7:2I8JI3G8HIJ2:3 p:3H2GFe=3J2:2 1j:4J8I2H4Gd=3F7G4:3 z| 7:I6GI4G8H2IJ:3 q:2G3Fe=3J2:3 1n:7J5IHGg=5F5G3H:3 x| 7:HGhHIJ:3 p:4G3Fd=3J2:3 1v:5J2H2Gj=3F5G4:3 v| 7:2Gc=2H2IJ:3 p:3IHG2Fd=3J2:3 21:4I2H2Gi=3F5G3H:3 t| 8:G8H2=3I3:3 n:5H5Fb=5J:3 26:4JIH6Gd=3F5G4:3 r| 8:2HG5=5IJ:3 o:2IH5Fc=3I3:3 2b:4J5HGe=2F6G4:3 p| 9:3HI6J2:3 q:IH2G2Fb=4I3:3 2g:5J2HGe=2F7G3H:3 n| b:b s:IFd=3H=I:4 2m:5H2Gc=3F6EG2H2:2 m| 1e:GFb=3I3:3 2t:3IHGc=F6EF2G3:4 j| 1e:Fb=2I3:3 2x:4Gb=3F3E2F4G4:3 h| 1e:FaG=I2:3 32:2Gc=2F9G5:8 a| 1e:F8:7 35:5G9=2FaEG9:3 8| 1e:F8: 3f:2G8=6F9G9:2 7| 1e:F8: 3g:G2FG6=aF4E2FE2F2G3:3 5| 1e:G=2F4:2 3g:3F2Ge=2F2E7F3=2J: 5| 1e:=4F3: 3j:2G2=G7=2G4=FE8F2=2J2: 5| 1e:G2=2FE2: 3k:2=3G6=4G2=Fa=2HI:2 5| 1e:=3FE2F: 3l:G2=8F2=2G=cGH2: 6| 1e:F4E2F: 3l:3Fa=2GfH: 6| 1e:F5E2: 3n:2F9=G8:a 6| 1e:E2F3E2: 3o:5F3G2:a f| 1e:E2F3E2:2 3r:7 o| 1e:E2F3EFH:2 4l| 1e:EF3E3H2:2 4k| 1e:2F3E3FG2:2 4j| 1f:F3E5G2:2 4i| 1f:EF2EFE4G2:2 4h| 1f:EF2E7GH: 4h| 1f:FEaG:2 4g| 1f:2EaFG: 4g| 1g:2F2E7FG: 4g| 1h:2F9:2 4g| 1i:b 4h| 6a| 6a"," 6a| 6a| 6a| 6a| 6a| 6a| 6a| 3v:4 5:3 23| 3q:3 :2J2:4 :2J:4 20| 3p:2J:3J6:3J5:2 1z| 3p:J6=Jd:b 1p| 3o:2J5=2Jn:4 1m| 3l:4Jy:4 1j| 3c:aJ14:3 1h| 36:7J1f:3 1f| 31:6J1k=2J:3 1d| 2v:7J1k=3IJ=3J2:3 1b| 2p:7J1p=9J4:4 18| 2i:8J19I2=2J4Ie=3H=6IJ5:6 13| 25:eJ1dI5=2Ij=2H=2I7J8:3 11| 20:6J1lIb=2IiH4=2HI=I6J7:3 z| 1x:4J1eIo=3IhH6=2IbJ4:2 y| 1v:3J19Ix=3IgH2=3H=2IdJ3:2 x| 1t:3J16I13=2IhH=5IcJ3=J2:3 v| 1k:6 2:2J13I19=2IgH6IbJ2=2*=2J2:3 t| 1g:5J4: 2:JyI1g=2IfH2=2H2IbJ=*5=J3:5 p| 1e:3J8: 2:JtI1m=2HIdH2=2H2IbJ2=2*=2J8:9 h| 1b:4J8:6JmI1tH4I8H5=2H3IH4IH6J3=J3H3Ja=2:2 g| 19:3Jc:3JdI21HIHi=HiJ3H9J3=6: g| 17:3Jd:2JaI1qH10=Hy=5: g| 13:5Jd:3J7I1mH18=2Hy=2J:2 g| 10:4Jg:3J6I1mH1aG2Hy=2J: h| x:4Jh:5J4I1cH1nGHxI=2J: h| u:4JgIJ3:3J2I1dH1q=3HuI=2J:2 h| t:2Jk=2J6IwH27=4Hg=6H6=3J:2 i| t:Jj=6J2IrH2f=G=HbI3=5HG=9J:2 j| p:5J5I3Ja=5JIoH2l=4H9=7J=IH2=6J2:2 k| n:3J2:6I9J4:J=IkH2kGHhI2Jg=J3:3 l| m:2J9:dJ2IgHI3H2mG2H6I3=4J6:k n| k:3J3I2JiIJIdH2uG2H2=6J5:6 16| j:2J3I9JdIaH2zG3=3J5:5 1b| h:3J3IuHwG2H25GH=2J:6 1f| g:2J3ItHyG3H1jGHn=2J: 1k| d:4J3IpH10=4HI=I3H1hG3HjIJ2:2 1j| b:3J4I9=aH3IH12=dIH2I2H1dG4HjI:4 1g| 5:7J5I6H2=iHy=3G=3J9I2J5IJ3I2H15G3=3HfGI4:3 1e| 3:3J2I3J3I5HcI2H=H=3G3=5Hs=3G2=2J2:cJaIH3G2HzG=7HeGI4H:4 1b| 2:2J3I4JH2I3Hf=5F8G=6GHdG5=5G2=3J:3 a:dIH4J2I5HnG=8J2IHgG2I5:3 19| 2:J3H7I4=IH4=aG2FdG3=bG=G4=4G4=3J2:2 o:4JbIHIJdIHG=4G4=2J:3HGHhGI5:3 17| 2:IH8I=dGFeG4F8G8=8G2F2G2=2J3:2 s:8JlI=2G3F2G3=2:4HeG3HG4IH3:3 15| 2:2H5=5J6=I=5FaG2H=6G2FkG4H=3J2:3 10:mJ=G2F5G3HJ: :2HG2H3G2H4GbH4:3 13| 3:2I3J=3J2:7J2=4F7G2H=6J2=I2H3G3FdG=7J:3 1n:2=G3F6G2I:2 :3GH3G2H4G2H2G9I2H2:4 10| 4:5J3:3 5:3J=3F6G=5J2:2J:6J4IHG2H2I8=J=2J2:3 1q:HG3F6G3J: 3:H3G5HGgI2H3:3 y| 8:5 6:3J=2GF5G2=2J3:7 4:aJb:5 1s:G4F8GI:2 2:H3GoI3H2:3 w| g:4H2IHGF3G3=3J2:3 j:d 1w:HG2FaGJ: 2:HI2HGqI2H2:4 t| d:4H5F6G2=2J3:2 2u:H2GFbI: 2:2J2IH2IH3GdHG8I2H2I:3 r| c:2H3GH2F8G=2J2:3 2v:IHGFbG:2 2:6J2IJIH2GlI5:4 o| b:2H2G2FaG=2J:3 2x:2GFcGI:2 6:7I3HGlI3H2:4 l| a:2H2Fc=3J:2 30:2GFcIJ: c:5I2H2GjI2H2I2:h 5| 9:2H2Fc=2IJ:2 32:2G4F8GI:2 f:4JIHG5H5GaI7HI3H5IH2:3 3| 9:H2FbG=2IJ:2 34:2H3GF8GJ: i:8GIJ3IHGcI8H4I2H3I:2 2| 9:2G5F6=3IJ:2 36:3IHGF8I: p:3J4IHG3H6GiI2J: 2| a:2I2H3G5=IJ:3 39:2HGF8G:2 q:6J2I4J2I2H4GfIJ: 2| b:5I7:3 3c:2GF9I: v:5J7I2HGdHJ2:2 2| f:9 3f:2F9H:2 y:8JI2H2G7H3IJ:3 3| 44:FaI: 15:4IH4I4J4:2 5| 44:2F9H:2 17:4J8:3 6| 45:2F9I:2 19:a 8| 46:2F8HI: 1r| 47:2F8I:2 1q| 48:2F8H: 1q| 49:2F7H:2 1p| 4a:2F7H:2 1o| 4b:F7HI: 1o| 4b:2F7H:4 1l| 4c:2F7H2I:2 1k| 4d:2F6H2=H:2 1j| 4e:2F7=H2:2 1i| 4f:F7=2H2:2 1h| 4f:2F7=3H: 1h| 4g:2F9H:2 1g| 4h:2F9H:2 1f| 4i:2F8H2:4 1c| 4j:2F8H4:5 18| 4k:2F8GH5G:5 14| 4l:2FaG8:2 13| 4m:2FcEG4H:2 12| 4n:2FbE5G2:2 11| 4o:3F9E5FGH: 11| 4q:3FeH: 11| 4s:5F9:3 11| 4w:b 13| 6a"," 6a| 6a| 6a| 6a| 6a| 6a| 6a| 6a| 6a| 6a| 3w:5 8:5 1w| 3v:2J3:aJ3:b 1m| 3n:9Jr:4 1j| 3j:5Jv=4J3:3 1h| 3d:7Jz=7J2:7 1b| 37:7J15=aJ5:7 15| 32:6J1b=2I4J3=3J9:4 12| 2x:6J1h=I3=3J=2Jd:3 10| 2o:aJ1m=2I3=5J4I6J5:2 z| 28:hJ1oI3J4I=2I4=2IbJ3=J2:4 w| 21:8J1q=2JcI5J2I2=2I2=2IbJ2=2*=2J3:c l| 1x:5J1vI2=3J5If=2HI=IcJ=*5=Jd:2 k| 1p:4 3:2J1xI5=3IlH=IdJ2=2*=2J2IJ8=4:2 j| 1j:7J2:2 :2J1vI9=2Il=2IeJ3=J3Ib=4: j| 1f:5J9:3J1pIh=2Ij=2IhJ3Id=4: j| 1d:3Jc:2J1hI4J3Il=2IhH=HIy=2J: j| 1a:4Jc:6J17IJ3Ix=2IgH4Ix=J2: j| 17:4Jh:3J13I16=2IgH4Iw=2J:2 j| 15:3Jj:2JqIJ6I1f=2IeH2GH2IjHIb=2J2: k| 12:4Jk:2JeI1z=3IdH2G2H3IfH3=dJ:2 k| 10:3Jm:2J7I28=2IdH2G2H4IeH3=4J2=5J2:2 l| y:3Jn:4J3I2bH=2IaH5G2H8IbH=HI=4J4:3 m| w:3Jq:3JI27HI2H4=2HfG=GH9I5=5J8:4 o| t:4Js:2JI25Hb=Hg=2H9I2=4J5:8 r| r:3JhIcJ2:J2I1wH2I2Hh=Hg=2H7=4J4:5 y| p:3JhIfJ3IsH3IsHv=Hh=3H5=2J3:4 12| o:2JeIj=3IsH4IrHw=HnIJ4:3 15| m:3JcIkH=4IrH5IgH17=2HkIJ3:4 17| l:2J5IsH2=2H2IjHhI3H1g=2HfI=2J4:3 1a| k:2J3Io=2I3H3=3H2I8H2b=2HcI=4J3:3 1c| i:3J2Ip=3IH2=5H2xI2=3J4:3 1e| h:2J3Io=3H3=3G2=2H2mG2H8=3J4:4 1g| g:2J3InH=3H=4G4=H25G2HgG2H5I2=3J2:4 1j| f:2J2IbH4I8=8G5=3HsIJ5IH17G2HfG2H4=4J2:3 1m| f:J=H3I5H2=3H2I=mHuJ7IH3=H13G2HeG2H3IJ4:3 1o| f:=2IH2=8I=9H1bJ:8JI=4I2HzG2HdGH2IJ3:4 1q| f:2=5G3H2=5J2=5H1aJ:2 6:3=9HxGHeIJ3:3 1t| g:2J=HG4=3J=J2:3J2IH1aJ2: 9:2J8IHI=3I3H12IJ2:3 1v| h:2J2IH2I=J2:7JH1aIJ2:2 a:9J5=aIHvIJ:2 1x| i:b 4:JH1aIJ2:2 j:6J9=5IHeGHcIJ: 1y| w:2IGH18IJ2:2 p:bJ4=fHdIJ: 1y| v:2IGH7I3=4IbHiIJ2:3 10:5J=HG7=2J3HGHbIJ: 1y| u:2I2GH5=7J2=cH2I=5I=6IJ3:2 16:H2G8=J2:2HGHbIJ: 1y| s:3I2H5=4Jr=5J4:3 16:2G9=2J:3G2HcI: 1y| q:3H2IGH4=2J3:qJ7:4 18:IG5F2G=2J:2 :HG3Hb:2 1x| m:5I4GHG3HJ3:3 o:9 1b:IGF6G=J2: 2:HG3HbJ: 1x| j:4H3I3G2H2G2HIJ:3 29:2G2F5G2=J:2 2:HG4HaJ:2 1w| i:2H3I4H5G3IJ:2 2b:IG2F5G=2J: 3:2G4HbJ: 1w| h:2H4G4H3G4IJ:2 2c:IF7G=J2: 4:2G4H9GI:2 1v| g:2IHGcHIJ:2 2d:GF7G=2:2 5:2G5H8GI: 1v| g:IHGcHIJ:2 2d:2F8=2J: 7:2IHG3H7GI:2 1u| f:2HGcHI:3 2e:HF7G=2:2 8:3G3H7G2I:2 1t| f:IGcHI:2 2g:HF7=2J: b:2G2H8GI2: 1t| f:2IH3G5H2I2:2 2h:GF6G=J2: c:G3H7G2I:2 1s| g:5IHI5:3 2h:2GF6G=2:2 c:2G3H6G3I:2 1r| k:9 2j:IGF6=2J: e:2G3H6G2I2: 1r| 3c:IF6G=2:2 f:2G4H4G3I:2 1q| 3c:GF6=2J: h:2GbI: 1q| 3c:F6G=J2: i:2G6HG3H:2 1p| 3c:F6G=J:2 j:2GaH:2 1o| 3c:F6=2J: l:2G9HI:2 1n| 3c:F6=IJ: m:2G9I2:2 1m| 3c:F6=I:2 n:2G9I2:2 1l| 3b:2F6=2: p:3G8I2:2 1k| 3b:GF5=2H:2 q:G9H2:3 1i| 3b:GF5=GHI: q:2G9HI2:2 1h| 3b:F6=G2I: r:2G9I3:2 1g| 3a:2F6=G3: s:2GaI2: 1g| 3a:GF6=G2:2 t:2GaH:2 1f| 3a:GF6=G2: v:2G9FH:2 1e| 3a:F7=G2: w:2G8FH2:3 1c| 3a:F7=G2: x:2F2G6FH3:2 1b| 3a:F7=FG: y:2F3G4F2H3:2 1a| 3a:2F6=2F: z:2F3G5F2H2:3 18| 3b:F9:2 z:2F3G6FH=H:3 16| 3b:F9G:3 y:2F3G6=2H3:3 14| 3b:F7E2G3:3 x:2F3G6=3H3:4 11| 3b:2F6E3G4:2 x:3F3G5F=FH4G:2 10| 3c:2F6EF3G2H: z:2F2=7F3H4:3 y| 3d:FcH: 10:2F=F4=aH: y| 3d:4F5G2F2G: 11:4F2=2F8H:2 y| 3g:c 14:5F3G2F2:3 z| 50:9 11"," 6a| 6a| 6a| 6a| 6a| 6a| 6a| 6a| 6a| 6a| 48:7 1v| 40:9J5:9 3:b 19| 3s:9Jl:5J9:4 16| 3q:3Jp=4J5=Jb:2 15| 3k:7JpI4=4J=2Jd:3 13| 3d:8Jv=2I5=4J6I2J3=J3:4 10| 2s:mJ12I=2IHI3=2J2I6J2=2*=2J4:e n| 2f:eJ1o=3IHI=2I9J=*5=Jf=:2 m| 26:aJ20I2=2I=3IaJ2=2*=2J2I2J9=5:2 l| 23:4J2aI3=3IcJ3=J3Id=5: l| 20:4J1v=JcI8=2IfJ3Ig=2J:2 l| 1v:6J1vI2=3J2Ih=Iz=2J: m| 1r:5J1yI5=3Ih=2HIy=J2: m| 1o:4J5=3J1gI6J5Ia=2IgH4Iw=2J:2 m| 1m:3J7=3JxI9J2Iu=3IfH4IqH2I2=3J:2 n| 1l:2J8=3JuI1a=3IeH4Ii=8H=5J:2 o| 1j:3J9=2JnI2J2I1f=2IfH4Ih=5H5=2J2:2 p| 1h:3Ja=2JnI1l=2IeH2=2HIfH7I4J3:2 q| 1e:4Jb=3JdI1v=3IdH2=2HId=3I3J7:4 r| 1b:4Je=3J5I24=2If=3HI9=5J5:7 u| 14:8Jg=4J2In=I1k=2IeH=3H4I2=5J3:6 10| 10:5JiI5=4Ip=2I1iH2=IdH4=H3I=4J3:4 15| w:5JjI8=4Ip=2I1fH5=HI6Hd=3J3:4 18| t:4JlI8=6Ip=2I1dH7=2H2I2HfJ4:3 1b| r:3JlIa=2H=4Ip=2IqH7IbHd=HhIJ3:3 1d| q:2JhIfH=G2=3Iq=2I8H2IH1a=2HfIJ2:3 1f| p:2JgIh=2G2=3Iq=2H1l=2HeIJ2:2 1h| n:3J2IuH2IHG2=2HIpH=2H1l=2HcI2J2:2 1i| m:2J3Ip=2I4H:2G4=HIkH6=2H1l=2Ha=4J:2 1j| m:J3Iq=2I2J2:2IGFG2=H2I8Hh=2H13=Hh=2H8I=3J:3 1k| l:2JIqH2=H2IJ:3IG4=H2I2HIHl=2H13=2Hg=2H8=3J:2 1m| k:2JI6J3IhH=2H2GH:3IG5=2Hq=2H1m=H7I=J2:2 1n| j:2J2IJ2=9H2I9H3=4H:5IG2FG3=2Hp=2H15G2HeG2H7J2:3 1o| j:J2=6J5=6HI4H3G=2GH:6IG2F3G3=2Ho=2H16GHeG2H4=2J2:2 1q| j:J=3J3:5J=2H3I2J=2IH=4F2GH2GHI2HF5GFG2=2Hn=7I2H1dG3H3=2J2:2 1r| j:IJ3:4 3:2=2I=aGF5H6FaG=2Hm=dH19G2H2=3J2:2 1s| j:6 7:2J9=3FnG=Hn=JaH19G3H=J3:3 1t| x:aJ=GF3G2FiG=2GHlJ:bIH2GHqGHe=HIJ:4 1v| 15:2=2GF2G4FeG2=4G2HkJ: 9:3I3=4HkG3Hb=3J2:2 1y| 15:IG2F3G4F9G5=3G4HlJ: b:4J4=H=8HaG3Hb=3J:2 1z| 14:2HF5G9=aG3HnIJ: e:5J=2G6=5H6G2HcJ=:3 20| 14:HF5G2=4I=4G6HtJ:2 h:2=2GFG8=3IJ3IG2HcJ2: 22| 14:HF3G2=3J6HG2HxJ2: i:IHG2FG2=3G2=2J2:3JIHdIJ:2 22| 13:2F3G=3J2:5HG2HxJ2:2 h:2HF4G2=G=4J2:2 :IHGHcJ2: 23| 12:2HF3=3J:3 3:G3HuI2J2:2 h:2HF5G2=2G=J2:3 2:G3HbIJ:2 23| 11:2H2F2G=2J:2 5:2G3HrIJ4:2 h:2H2F6G=2GIJ:2 4:G3HbIJ: 24| 10:2H2F2G=2J:2 7:HGHiI2H2=5IJ3:3 h:2H2F7=2GIJ:2 5:G4HaIJ: 24| y:3H2F3G=J:2 8:HGH7I2=hJ3:3 j:H2F7G=2IJ:2 6:2G3HbJ: 24| x:2H3F3G=2J: 9:2GH6=5Jf:4 k:2HF7G=2IJ:2 8:G4HaI: 24| v:3H3F3G=2J:2 a:GH5IJ4:h m:2HF8=2IJ:2 9:2G4H9I: 24| u:2H3F5G=IJ: b:G2H4J:5 12:H2F7=2IJ:2 b:2G3H8GH: 24| t:2H2GF6=2I:2 b:G2H2GHI: 15:2HF7=2IJ:2 d:G3H7GHI:2 23| t:IHF7=2IJ: c:G2HG2HI: 14:2=GF6G=IJ:2 e:2HG2H8IJ: 23| t:IGF4=4HI:2 c:G2H2GHI: 14:J=2F5G=2J:2 g:2HGH8IJ: 23| t:H2G3=2HI3:2 d:G2H2G2H: 13:2IG=F4G=2J:2 i:2GH8IJ: 23| t:2I2H2=I3:3 d:2G3HG2H: 13:IG=2F3G=2J:2 k:G2H4G2HI2:2 22| u:a f:JG3HG2H:2 11:2=3F4=2J:2 l:2GH2G5H2J: 22| 1j:IG6HJ: 11:HF6=3:2 n:HGHG7J: 22| 1j:G7HJ: 10:2HF6=J:2 o:2G9H:2 21| 1j:G8H: z:2HF7G:2 q:2G9J: 21| 1j:G8H: z:H2F6G:2 s:2G8I:2 20| 1i:2G8H: z:HF6G:2 u:G8HJ: 20| 1h:2HG7H:2 y:2F7G: v:2G8J: 20| 1g:2I2G2FG4H: z:HF7:2 w:2G8:2 1z| 1g:I2G3F3GH:2 z:HF7: y:G8I:2 1y| 1g:2G3F4G:2 10:F7:2 y:2G7I2:2 1x| 1h:G3F2G2:2 11:F4=2F: 10:G8I2: 1x| 1h:2G4:3 12:F3=2G:2 10:2G8H:2 1w| 1i:6 14:F3=G2:2 11:2G6FGH: 1w| 2s:F3=G2H: 12:2G5F=H:2 1v| 2s:F3=G2H: 13:G5=3H:2 1u| 2s:F3=F=G: 13:2G4=4H:3 1s| 2s:F3=4:2 13:2G4=5H:3 1q| 2s:F7G:2 13:2G4=2FHG2H:3 1o| 2s:EF6G2:3 12:2G4=2F=3H2:3 1m| 2s:2F7G3:2 12:2G2F2=3F2H=H2:3 1k| 2t:F8G3:2 12:2GF6=3H4:2 1j| 2t:F8EF=2:2 12:2F4=3F4GH2:2 1i| 2t:2F=4F3=2H2: 13:3F2=F8H2: 1i| 2u:2F3=5FGH: 15:3FaH: 1i| 2v:2FG2F4G2:2 17:3F8:2 1i| 2w:b 1a:a 1j| 6a"," 6a| 6a| 6a| 6a| 6a| 6a| 4b:5 1u| 4a:2J3:5 2:b 1d| 47:4J2=3J3:4J9:4 1a| 46:2J3=2J=3Ji:2 19| 3z:8J3=3JI2=I2J=2Jc=J:3 17| 3u:6Jb=3H2I3=2Jb=2*=2J:3 15| 3s:3Jh=2H3I2=2J2I7J=*5=J2:f r| 3p:4JjIH5=2IaJ2=2*=2Jf=2:2 q| 2l:11 2:2JnIH3=3IbJ3=J3I2J9=6: q| 2h:5Jz:4JoI2H=2IfJ3Ie=5: q| 2d:5J1sIJ2I2=2Iz=J2: q| 2a:4J1vI6=2Iz=J2: q| 27:4J1xI7=Iz=2J:2 q| 24:4J1wIb=H2Ix=2J: r| 22:3J17IkJ4IfH=HIt=5J:2 r| 20:3JyI4JI19H=H2IjH=cJ2: s| 1y:3JuI14=2IeH=H3IiH=aJ3:2 s| 1w:3JqI1a=2IeH3=HIiH6IJ5:3 t| 1v:2JqI1d=2IeH2=2HIf=4I2J5:4 v| 1t:3J2=2JlI1f=2IfH=3H2I8H3=4J5:5 y| 1s:2J3=3JgI1l=2IeH2=3Hb=3J=J:5 12| 1q:3J3=3JcIa=3I1d=2IfH2=4H9IJ3:3 16| 1p:2J5=2J9If=2I1e=2I9H9=4H6IJ2:3 18| 1n:3J5=2J8Ih=3IkH5Io=2I7HjIJ2:3 1a| 1k:4J7=2J2Io=2IiH9IlH2=HI6HiIJ2:2 1c| 1h:4Ja=2Ir=2IgHjIaH4=2HnIJ2:2 1d| 1c:6JaIJ4Is=2I8H14=2HmIJ2:2 1e| 14:9JeI3J2I2=Iq=2H1d=Hk=2J2:2 1f| 10:5JkI8=2Ir=2H1c=Hj=2J2:2 1g| x:4JlIa=3IpH2=2H1c=2Hh=3J:2 1h| u:4JjIdH=3HIiHa=2H1b=2HgJ=J2:2 1i| t:2JkIeH=2G=HIdHg=H1c=He=2J2:3 1j| q:4JeIkH=2G2=HIbHi=2H1b=Hd=2J2:2 1l| p:2J7I2J3IoH=2GFG=HI2H3I3Hm=H1b=Hc=2J2:2 1m| n:3J4Ix=2GF2G=HvGH1b=Hb=2J2:2 1n| m:2J3Iz=2GF4=4HsG2H1a=Hb=J2:2 1o| k:3J3IvHI2=5GF5G=HsG2H1a=HaJ2:3 1p| j:2J3IuH4I=3J2=GF5G=HsG2H1a=H9IJ:2 1r| j:J3Iu=2HI=4J:3HGF5=HrG2HqG3Hi=H8IJ:2 1s| i:2J6=4IJI3=2IdH2=2H2=3J:3 :JGF5=2HrIJ3IHlG4HhG=GH3=4J:2 1t| i:J=hIdH5IJ3:2 3:HGF6=3HoIJ6I2HhG4HhG4H2J=3J:2 1u| i:2Ja=nJ4:3 4:2G=2GF4G=2GHmIJ:3J4HfG5HiG3HIJ5:2 1v| j:cJ5=8J3=6J2:3 7:2=3GF5=2GHlJ:2 :4J2I=4IH7G4Hj=3IJ2:6 1w| u:6J8:4J4:4 a:J=2G3F4=3HkJ: 5:4J3=5H3G=2GHj=2J3:3 21| z:a 2:6 b:3=6GF4G=2HiIJ: 8:4J4=6G2HgGH2J3:3 23| 1q:3H2GH=G2=2F5G=2HhJ2: b:5J=3H2GHeG2H2J2:4 25| 1n:4H4FG=H2G=2F4G2=2GHfJ:2 f:J=HGHiIJ3:2 28| 1k:4H2GH2F3G=H3G=2G=4H=2G2HcIJ: f:2I=HGHd=2IJ3:4 29| 1j:2IH5F5G=H3G2=3G2=3JHG2HbJ:2 f:J=2HbG3=3J:4 2c| 1j:H4F8G=GH3G2=2HI=2J:2HdJ: f:2IG3H8G2=5J:2 2f| 1j:HFaG2=H2IJI2=2J2:6HbJ2: f:HG4H6G3=2G=2J:2 2g| 1j:FaG=3IJ5:5 4:HGH9J:2 f:IG4H6G2=2G=2J:2 2h| 1j:2F8=5J2:5 8:G2H8I:2 f:2G5H5G=3FG=J2: 2i| 1k:2F6G=2J:5 c:G2H7IJ: f:2IG5H2G4=GFG=2J:2 2i| 1l:2F5G=J:2 f:2G3H5IJ:2 f:HIGa=2F2G=J:2 2j| 1m:GF5GH:2 f:HG6H2J2: f:2HG9=3F2G=2J: 2k| 1m:2GF6I:2 d:2HG7HJ:2 f:IG9=2F3G=2J:2 2k| 1n:2GF5HI:2 b:2HG8HJ: f:2IG8=2F4G=J2: 2l| 1o:2GF5HI:2 9:2IHG8IJ: f:IG8=3F4=2J:2 2l| 1p:G2F5H=:2 8:IHG9IJ: e:2HG8=3F3G=J2: 2m| 1p:2GF5G=J:2 6:2IGaHI: d:2HG8=4F3=2J:2 2m| 1q:2G2F4=2J:2 5:IGcH:4 a:H2G6=G=4F3=2:2 2n| 1r:HG2F4=2J:2 4:IGdIH2:6 4:2HG6=6F3G=J: 2o| 1r:2GF6=J2: 4:3GFGaH8:6IG8H=2H=F3=2J: 2o| 1s:GF6=HJ: 6:2FGdHaI2G7HI3=2F3=2:2 2o| 1s:2GF5=HI: 7:F2GhH5=3G5HI4=GF2=2J: 2p| 1t:GF5=HI: 7:2F2=5Gd=3G=3G4=I3=2F3=IJ: 2p| 1t:=2F4=H2: 8:3G2=7G9=5F=2G2=2H=3F4=HI: 2p| 1t:G=F4=GH: a:3H4=7G7=2F3=7F6=H2:2 2o| 1t:G=2F3=G2: c:4HG=8G6=F3EFc=G2I: 2o| 1t:2G=5G:2 f:5G2=G2=8FE4Fa=2G2:2 2o| 1u:G3=2G:2 k:4G3F7=2E3F9=2G2:2 2p| 1u:2G4:2 o:5F3=5E3F7=3G2:2 2q| 1v:6 t:4=FGF=E4F4=3FG2:2 2r| 2x:2G3=E4=5G4:2 2s| 2y:G3=F2=3F4G3:2 2t| 2y:G2F=F2=3F4G3: 2u| 2y:G2F=F2=4F6: 2u| 2y:F2=2F5=2F5: 2u| 2y:F=2F7=2F4:2 2t| 2y:F2=2F7=F4H:2 2s| 2y:2F=2F7=F4H2: 2s| 2z:=2F7=2FG4H: 2s| 2z:2F=8FG5:2 2s| 30:3Gd: 2t| 32:3G9F:2 2t| 34:c 2u"]};

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function decodeFrames(data) {
  return data.frames.map((f) =>
    f.split('|').map((row) => {
      let out = '';
      for (let i = 0; i < row.length; ) {
        const ch = row[i++];
        let j = i;
        while (j < row.length && /[0-9a-z]/.test(row[j])) j++;
        out += ch.repeat(j > i ? parseInt(row.slice(i, j), 36) : 1);
        i = j;
      }
      return out;
    })
  );
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (c, w, k) => [c[0] + (w[0] - c[0]) * k, c[1] + (w[1] - c[1]) * k, c[2] + (w[2] - c[2]) * k];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function pack(r, g, b) { return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0; }

function evalPawMark(dx, dy) {
  const u = dx * 0.72;
  const v = dy * 0.88;
  const d_heel = Math.hypot(u + 0.65, v) / 0.85;
  const d_t1 = Math.hypot(u - 1.15, v + 0.60) / 0.42;
  const d_t2 = Math.hypot(u - 1.15, v - 0.60) / 0.42;
  const d_t3 = Math.hypot(u - 0.70, v + 1.25) / 0.38;
  const d_t4 = Math.hypot(u - 0.70, v - 1.25) / 0.38;
  const d_c1 = Math.hypot(u - 1.75, v + 0.60) / 0.28;
  const d_c2 = Math.hypot(u - 1.75, v - 0.60) / 0.28;
  return Math.min(d_heel, d_t1, d_t2, d_t3, d_t4, d_c1, d_c2);
}

export function createSnowWolfMono(canvas, options = {}) {
  const o = {
    cell: 3,
    dot: 0.74,
    margin: 30,
    groundRows: 38,
    background: '#141518',
    wolfColor: '#ececec',
    groundColor: '#f0f4f8',
    snowGlint: '#ffffff',
    pawColor: '#242730',
    pawLife: 2600,
    speed: 1,
    maxFps: 30,
    ...options
  };

  const frames = decodeFrames(WOLF_DATA);
  const wolfCols = WOLF_DATA.cols, wolfRows = WOLF_DATA.rows;
  const frameMs = 1000 / WOLF_DATA.fps;
  const cycleMs = frameMs * frames.length;
  const contactRow = 91;
  const groundTop = contactRow - 10;
  const TEX = 2048;
  const cols = wolfCols + o.margin * 2;
  const rows = contactRow + o.groundRows;
  const dpr = window.devicePixelRatio || 1;
  const K = Math.max(2, Math.round(o.cell * dpr));
  const ds = Math.max(1, Math.round(K * o.dot));

  canvas.width = cols * K;
  canvas.height = rows * K;
  canvas.style.width = (cols * K) / dpr + 'px';
  canvas.style.aspectRatio = `${cols} / ${rows}`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy() {} };

  const small = document.createElement('canvas'); small.width = cols; small.height = rows;
  const sctx = small.getContext('2d');
  const simg = sctx.createImageData(cols, rows);
  const sbuf = new Uint32Array(simg.data.buffer);

  const mask = document.createElement('canvas'); mask.width = cols * K; mask.height = rows * K;
  const m = mask.getContext('2d');
  m.fillStyle = o.background; m.fillRect(0, 0, mask.width, mask.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) m.clearRect(x * K, y * K, ds, ds);

  const BG = pack(...hex(o.background));
  const monoWolf = hex(o.wolfColor);
  const C_glow = pack(255, 255, 255);
  const C_light = pack(...monoWolf);
  const C_base = pack(...mix(monoWolf, [180, 184, 192], 0.35));
  const C_mid = pack(...scale(monoWolf, 0.65));
  const C_dark = pack(...scale(monoWolf, 0.40));
  const C_snow = pack(...hex(o.groundColor));
  const C_snow_hi = pack(...hex(o.snowGlint));
  const C_paw_indent = pack(...hex(o.pawColor));

  const poses = frames.map((f) => {
    const a = new Uint8Array(wolfRows * wolfCols);
    f.forEach((row, y) => { for (let x = 0; x < wolfCols; x++) {
      const c = row[x];
      a[y * wolfCols + x] = c === ' ' ? 0 : c === ':' || c === '=' ? 1 : c === '*' ? 2 : 10 + c.charCodeAt(0) - 65;
    } });
    return a;
  });

  const tex = new Float32Array(rows * TEX), depth = new Float32Array(rows), fade = new Float32Array(cols);
  for (let x = 0; x < cols; x++) fade[x] = smooth(0, 24, x) * smooth(0, 24, cols - 1 - x);
  for (let y = groundTop; y < rows; y++) {
    const d = (y - groundTop) / (rows - 1 - groundTop);
    depth[y] = d;
    for (let i = 0; i < TEX; i++) {
      let g;
      if (y === groundTop) {
        g = vnoise(i / 6, 8.5) > 0.35 ? 0.85 : 0.4;
      } else {
        const n = vnoise(i / (4 + 14 * d), y * 0.32) * 0.6 + vnoise(i / 1.5, y * 1.5) * 0.4;
        g = 0.78 + 0.14 * d + (n - 0.5) * 0.28;
      }
      tex[y * TEX + i] = g;
    }
  }

  const speedAt = () => WOLF_DATA.groundSpeed;
  const depthFactor = (y) => (y < contactRow ? 0.7 + 0.3 * (y - groundTop) / (contactRow - groundTop) : 1 + 1.1 * (y - contactRow) / o.groundRows);

  function activePawMarks(t) {
    const out = [];
    const maxAge = o.pawLife;
    for (let k = Math.floor((t - maxAge) / cycleMs) - 1; k <= Math.floor(t / cycleMs); k++) {
      for (const c of WOLF_DATA.contacts) {
        const t0 = k * cycleMs + c.frame * frameMs;
        if (t0 <= t && t - t0 <= maxAge) {
          const age = t - t0;
          const px = c.x + o.margin - (age / frameMs) * speedAt();
          const py = c.y;
          if (px >= -25 && px <= cols + 25) {
            out.push({
              px, py, age, foot: c.foot,
              decay: Math.pow(1 - age / maxAge, 0.7),
              fresh: Math.max(0, 1 - age / 300)
            });
          }
        }
      }
    }
    return out;
  }

  let start = performance.now();
  let raf = 0, lastDraw = -1e9;

  function draw(now) {
    const t = Math.max(0, (now - start) * o.speed);
    const fi = Math.floor(t / frameMs) % frames.length;
    const pose = poses[fi];
    const paws = activePawMarks(t);
    const scroll = (t / frameMs) * speedAt();

    sbuf.fill(BG);

    for (let x = 0; x < cols; x++) {
      const wx = x - o.margin, inWolf = wx >= 0 && wx < wolfCols, fx = fade[x];
      const nearPaws = paws.filter((p) => Math.abs(x - p.px) <= 6);

      for (let y = 0; y < rows; y++) {
        const th = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        const code = inWolf && y < wolfRows ? pose[y * wolfCols + wx] : 0;
        let col = 0;

        if (code >= 10) {
          // Wolf body tones (monochrome shading)
          const tone = code - 10;
          const val = (tone / 9) * 3;
          if (val < 1) {
            col = val > th ? C_mid : (tone === 0 && th > 0.65 ? 0 : C_dark);
          } else if (val < 2) {
            col = (val - 1) > th ? C_base : C_mid;
          } else {
            col = (val - 2) > th ? (tone === 9 && th < 0.4 ? C_glow : C_light) : C_base;
          }
        } else if (code === 2) {
          // Diamond glowing eye
          col = C_glow;
        } else if (code === 0 && y >= groundTop) {
          // Snow ground (clean, zero background dots in the sky)
          let i = Math.floor(x + scroll * depthFactor(y)) % TEX;
          if (i < 0) i += TEX;

          let lv = tex[y * TEX + i] * fx;
          let inPawIndent = 0, inPawRim = 0, snowSpray = 0;

          if (nearPaws.length > 0 && Math.abs(y - 91) <= 4) {
            for (const p of nearPaws) {
              const dx = x - p.px, dy = y - p.py;
              if (Math.abs(dy) <= 3.2) {
                const d = evalPawMark(dx, dy);
                if (d < 0.95) {
                  const depth = (1 - d / 0.95) * p.decay;
                  if (depth > inPawIndent) inPawIndent = depth;
                } else if (d < 1.45) {
                  const rim = (1 - Math.abs(d - 1.2) / 0.25) * p.decay;
                  if (rim > inPawRim) inPawRim = rim;
                }
              }
              if (p.fresh > 0 && dx < 0 && dx >= -5 && dy >= -2.5 && dy <= 1) {
                const sp = hash(x, y + Math.floor(p.age * 0.1)) > 0.6 ? p.fresh : 0;
                if (sp > snowSpray) snowSpray = sp;
              }
            }
          }

          if (inPawIndent > 0.18) {
            col = C_paw_indent;
          } else if (inPawRim > 0.25 || snowSpray > 0.3) {
            col = C_snow_hi;
          } else if (lv > th) {
            col = (((x * 7 + y * 13) & 15) === 0) ? C_snow_hi : C_snow;
          }
        }
        if (col) sbuf[y * cols + x] = col;
      }
    }

    // Snowfall: Crisp falling snowflakes drifting through the clean sky and over the snow
    const flakeCount = 48;
    for (let j = 0; j < flakeCount; j++) {
      const fx_seed = hash(j, 137), fy_seed = hash(j, 921);
      const speedY = 0.016 + fx_seed * 0.022;
      const driftX = Math.sin(t * 0.0011 + j * 1.7) * 6 - t * 0.009;
      const py = Math.floor((fy_seed * rows + t * speedY) % rows);
      const px = Math.floor(((fx_seed * cols + driftX) % cols + cols) % cols);
      const wx = px - o.margin;
      const inWolf = wx >= 0 && wx < wolfCols && py < wolfRows && pose[py * wolfCols + wx] > 0;
      if (!inWolf) {
        // Crisp snow crystal
        sbuf[py * cols + px] = j % 4 === 0 ? C_snow_hi : C_light;
      }
    }

    sctx.putImageData(simg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cols * K, rows * K);
    ctx.drawImage(mask, 0, 0);
  }

  function loop(now) {
    if (now - lastDraw >= 1000 / o.maxFps - 2) {
      draw(now);
      lastDraw = now;
    }
    raf = requestAnimationFrame(loop);
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) draw(performance.now());
  else raf = requestAnimationFrame(loop);

  return {
    destroy() { cancelAnimationFrame(raf); }
  };
}
