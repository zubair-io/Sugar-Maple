import { blankDocument, NodeSchema, validateDocument } from '../src/web/src/app/model/schema';
const document = blankDocument();
document.id = 'native-preview-fixture'; document.name = 'Native preview acceptance';
const pageId = document.pages[0].id;
document.nodes = [
  { id:'login', kind:'artboard', name:'Sign in', width:400, height:800, layout:'vertical', padding:24, gap:12 },
  { id:'email', parentId:'login', kind:'input', name:'Email', accessibleLabel:'Email', inputType:'email', initialValue:'mock@example.test', widthMode:'fill', height:44 },
  { id:'password', parentId:'login', kind:'input', name:'Password', accessibleLabel:'Password', inputType:'password', initialValue:'DemoOnly', widthMode:'fill', height:44 },
  { id:'disabled', parentId:'login', kind:'input', name:'Unavailable', accessibleLabel:'Unavailable', disabled:true, initialValue:'Locked', widthMode:'fill', height:44 },
  { id:'component', parentId:'login', kind:'frame', name:'Account card', isComponent:true, layout:'vertical', widthMode:'fill', height:160, padding:12, gap:8 },
  { id:'nested', parentId:'component', kind:'frame', name:'Nested content', layout:'vertical', widthMode:'fill', height:100 },
  { id:'go', parentId:'nested', kind:'button', name:'Continue action', text:'Continue', targetId:'welcome', prototypeAction:'navigate', transition:'dissolve', widthMode:'fill', height:44 },
  { id:'open', parentId:'login', kind:'button', name:'Open terms', text:'Open terms', targetId:'terms', prototypeAction:'openOverlay', widthMode:'fill', height:44 },
  { id:'welcome', kind:'artboard', name:'Welcome', width:400, height:600 },
  { id:'welcome-text', parentId:'welcome', kind:'text', name:'Greeting', text:'You made it!', width:300, height:50 },
  { id:'terms', kind:'artboard', name:'Terms overlay', width:320, height:260, layout:'vertical', padding:24, gap:12 },
  { id:'terms-text', parentId:'terms', kind:'text', name:'Terms text', text:'These are prototype terms.', widthMode:'fill', height:60 },
  { id:'close', parentId:'terms', kind:'button', name:'Done', text:'Done', prototypeAction:'closeOverlay', widthMode:'fill', height:44 },
].map((node, order) => NodeSchema.parse({...node, pageId, order, fill:'#ffffff', color:'#111111', fontFamily:'Maple Sans'}));
const snapshot = {version:1,documentId:document.id,revision:0,rootId:'login',document:validateDocument(document)};
export default snapshot;
if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) throw Error('Pass an owned output file');
  await Bun.write(destination, JSON.stringify(snapshot));
}
