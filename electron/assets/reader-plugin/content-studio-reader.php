<?php
/**
 * Plugin Name: Content Studio Reader
 * Description: Accessible recipe print, ingredient checklist, cook mode and optional consent-aware GA4 events.
 * Version: 1.0.0
 * License: MIT
 */
if (!defined('ABSPATH')) { exit; }
add_action('admin_init', function () {
    register_setting('cs_reader', 'cs_reader_events', array('type' => 'boolean', 'default' => false, 'sanitize_callback' => 'rest_sanitize_boolean'));
});
add_action('admin_menu', function () {
    add_options_page('Content Studio Reader', 'Content Studio Reader', 'manage_options', 'cs-reader', function () {
        if (!current_user_can('manage_options')) { return; }
        echo '<div class="wrap"><h1>Content Studio Reader</h1><form method="post" action="options.php">';
        settings_fields('cs_reader');
        echo '<p><label><input type="checkbox" name="cs_reader_events" value="1" ';
        checked(get_option('cs_reader_events', false));
        echo '> Send recipe events through the site\'s existing Google tag</label></p><p>No tracking code is installed by this plugin. Your existing consent configuration still applies. Check your site privacy and consent requirements before enabling.</p>';
        submit_button();
        echo '</form></div>';
    });
});
add_action('wp_enqueue_scripts', function () {
    if (!is_singular() || is_admin()) { return; }
    wp_enqueue_style('cs-reader', plugins_url('reader.css', __FILE__), array(), '1.0.0');
    wp_enqueue_script('cs-reader', plugins_url('reader.js', __FILE__), array(), '1.0.0', true);
    wp_add_inline_script('cs-reader', 'window.csReaderSettings=' . wp_json_encode(array('events' => (bool)get_option('cs_reader_events', false), 'postId' => (string)get_queried_object_id())) . ';', 'before');
});
