Content Studio Reader (MIT, original code)

Install the ZIP through WordPress Plugins > Add New > Upload, then activate.
Test on staging before enabling on your live site. Only cards with id="recipe-card" receive controls.
No API key, remote script, tracking loader or database table is added.
Printing, a device-local bookmark, ingredient checkboxes, a shopping list, sharing (where supported), and optional screen wake lock are independent of analytics.

Analytics is OFF by default. Settings > Content Studio Reader can enable events through your EXISTING gtag implementation. It does not override consent or load a Google tag. Configure your consent solution first. Event names: cs_recipe_view, cs_recipe_print, cs_recipe_save, cs_shopping_list. GA4 sessionManualAdContent uses your Pin URL's utm_content for creative attribution. Google privacy thresholds, attribution and processing delays apply. Event counts are not unique users or CTR.

This plugin does not establish recipe accuracy, safety, taste or nutrition. No fake ratings or reviews are generated.
