const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { payloadRevision, revisionMarker } = require('../electron/wordpress-delivery');
async function main() {
  if (!process.env.CS_WP_TEST_OUTPUT) throw new Error('Run through test-wordpress-driver.cjs so the PHP assertion receipt is verified.');
  const { runCLI } = await import('@wp-playground/cli');
  const image = await sharp({ create: { width: 200, height: 300, channels: 3, background: '#437352' } }).jpeg().toBuffer();
  const content = '<section id="recipe-card"><h2>Staging Lemon Rice</h2><h3>Ingredients</h3><ul><li>1 cup rice</li></ul><h3>Instructions</h3><ol><li>Cook rice.</li></ol></section>';
  const payload = { title: 'Content Studio Staging', slug: 'content-studio-staging', content, status: 'draft' };
  const marker = revisionMarker(payloadRevision(payload)); payload.content += marker;
  const steps = [{ step: 'mkdir', path: '/wordpress/wp-content/plugins/content-studio-reader' }];
  for (const name of ['content-studio-reader.php', 'reader.js', 'reader.css']) steps.push({ step: 'writeFile', path: `/wordpress/wp-content/plugins/content-studio-reader/${name}`, data: await fs.readFile(path.resolve('electron/assets/reader-plugin', name), 'utf8') });
  steps.push({ step: 'activatePlugin', pluginPath: 'content-studio-reader/content-studio-reader.php' });
  steps.push({ step: 'runPHP', code: `<?php
require '/wordpress/wp-load.php';
function cs_assert($condition,$message) { if (!$condition) { throw new Exception($message); } }
wp_set_current_user(1);
cs_assert(get_option('cs_reader_events',false) === false, 'Reader analytics must be off by default');
$before = count(get_posts(array('post_type'=>'post','post_status'=>'any','numberposts'=>-1)));
$fail = function($result,$server,$request) { return $request->get_route() === '/wp/v2/media' ? new WP_Error('staging_503','Simulated media outage',array('status'=>503)) : $result; };
add_filter('rest_pre_dispatch',$fail,10,3);
$req = new WP_REST_Request('POST','/wp/v2/media');
$req->set_header('content-type','image/jpeg'); $req->set_header('content-disposition','attachment; filename="staging-pin.jpg"');
$req->set_body(base64_decode('${image.toString('base64')}'));
$failed = rest_do_request($req);
cs_assert($failed->get_status() === 503, 'Simulated media 503 must surface');
cs_assert(count(get_posts(array('post_type'=>'post','post_status'=>'any','numberposts'=>-1))) === $before, 'Media failure created a post');
remove_filter('rest_pre_dispatch',$fail,10);
$uploaded = rest_do_request($req); cs_assert($uploaded->get_status() === 201, 'Actual WordPress media upload failed: '.wp_json_encode($uploaded->get_data()));
$media = $uploaded->get_data();
$payload = json_decode(base64_decode('${Buffer.from(JSON.stringify(payload)).toString('base64')}'),true); $payload['featured_media']=$media['id'];
$postreq = new WP_REST_Request('POST','/wp/v2/posts'); $postreq->set_body_params($payload);
$created = rest_do_request($postreq); cs_assert($created->get_status() === 201,'Draft creation failed'); $post=$created->get_data();
cs_assert(strpos($post['content']['raw'],'recipe-card') !== false,'Recipe card was lost');
cs_assert(strpos($post['content']['raw'],'${marker}') !== false,'Revision marker was lost');
$edit = new WP_REST_Request('POST','/wp/v2/posts/'.$post['id']); $edit->set_body_params($payload); cs_assert(rest_do_request($edit)->get_status() === 200,'Idempotent update failed');
cs_assert(count(get_posts(array('post_type'=>'post','post_status'=>'any','numberposts'=>-1))) === $before+1,'Update duplicated a post');
wp_set_current_user(0); cs_assert(rest_do_request($postreq)->get_status() >= 400,'Unauthorized publication was accepted');
file_put_contents('/cs-test-output/passed.json',wp_json_encode(array('mediaOutage'=>true,'mediaRecovered'=>true,'recipePreserved'=>true,'noDuplicate'=>true,'unauthorizedBlocked'=>true,'analyticsDefaultOff'=>true)));
echo "PASS: real WordPress REST media 503, upload recovery, draft recipe preservation, repeat update and unauthorized request; reader analytics off.\\n";
` });
  await runCLI({ command: 'run-blueprint', wp: '6.8', php: '8.3', mount: [{ hostPath: process.env.CS_WP_TEST_OUTPUT, vfsPath: '/cs-test-output' }], blueprint: { preferredVersions: { wp: '6.8', php: '8.3' }, steps } });
  console.log('WordPress staging assertions passed: media 503/recovery, recipe draft, repeat update, unauthorized publishing and reader privacy defaults.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
