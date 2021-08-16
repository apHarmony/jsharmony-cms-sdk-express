# jsharmony-cms-sdk-express
jsHarmony CMS SDK for Node.js / Express

## Installation

1. Install "jsharmony-cms-sdk-express" in your project:

   ```
   npm install jsharmony-cms-sdk-express
   ```

2. Configure the Deployment Target in the jsHarmony CMS:

   a. In the jsHarmony CMS, open the "Sites" tab

   b. Click "Configure Site" on the target site

   c. Add a new Deployment Target, setting the publish folder to a subfolder in your project

3. Add the Integration Code:

   a. In the jsHarmony CMS, open the "Sites" tab

   b. Click "Configure Site" on the target site

   c. Select and edit the Deployment Target

   d. Select the "Integration Code" tab in the Deployment Target

   e. Copy the server-side Integration Code into your Node.js / Express.js application, for example:

   ```js
   const jsHarmonyCmsRouter = require('jsharmony-cms-sdk-express').Router;
   const cmsRouter = new jsHarmonyCmsRouter({
       content_path: "data/content/",
       redirect_listing_path: "jshcms_redirects.json",
       cms_server_urls: ["https://cms.example.com/"]
   });
   ```

   f. Add the Router into your Express.js application:

   ```js
   //Assuming "app" is your Express Router - app = express()
   app.use(cmsRouter.getRouter({ generate404OnNotfound: true }));
   ```

   g. Copy the client-side template Integration Code into your CMS Page Template:

   ```html
   <script type="text/javascript" class="removeOnPublish" src="/.jsHarmonyCms/jsHarmonyCmsEditor.js"></script>
   <script type="text/javascript" class="removeOnPublish">
   jsHarmonyCmsEditor({"access_keys":["xxxxxxxxxxxxxxxxxxxxxxx"]});
   </script>
   ```
   
4. Publish the content to the target folder, and test

## API Documentation

## *jsHarmonyCmsRouter Class*

* [Constructor](#constructor)
* *Public Properties*
   * [onError](#onerror)
   * [onPageRender](#onpagerender)
   * [onRedirect](#onredirect)
* *Public Methods*
   * [getRouter](#getrouter)
   * [getStandalone](#getstandalone)
   * [isInEditor](#isineditor)
   * [resolve](#resolve)
   * [route](#route)
   * [getPageData](#getpagedata)
   * [getPageFile](#getpagefile)
   * [getRedirectData](#getredirectdata)
   * [getEditorScript](#getEditorScript)
   * [matchRedirect](#matchredirect)
   * [generate404](#generate404)
   * [generateError](#generateerror)

---

## Constructor

```js
new jsHarmonyCmsRouter(config)
```

#### Arguments

- `config` (Object) :: Object with one or more of the configuration keys below:
```js
{
  content_path: null,
  //(string) File path to published CMS content files

  redirect_listing_path: null,
  //(string) Path to redirect listing JSON file (relative to content_path)

  default_document: 'index.html',
  //(string) Default Directory Document

  strict_url_resolution: false,
  //(bool) Whether to support URL variations (appending "/" or Default Document)

  passthru_timeout: 30,
  //(int) Maximum number of seconds for passthru request

  cms_clientjs_editor_launcher_path: '/.jsHarmonyCms/jsHarmonyCmsEditor.js',
  //(string) Path where router will serve the client-side JS script that launches CMS Editor

  cms_server_urls: [],
  //Array(string) The CMS Server URLs that will be enabled for Page Editing (set to '*' to enable any remote CMS)
  //  * Used by page.editorScript, and the getEditorScript function
  //  * NOT used by jsHarmonyCmsEditor.js - the launcher instead uses access_keys for validating the remote CMS
}
```

#### Example
```js
var cmsRouter = new jsHarmonyCmsRouter({ cms_server_urls: ['https://cms.example.com'] });
```

---

## Public Properties

---

### onError
`function(err, req, res, next){ }`

Function executed when an unexpected error occurs
```js
cmsRouter.onError = function(err, req, res, next){ console.error(err); };
```

---

### onPageRender
`function(pageFile, req, res, next){ }`

Function executed to render the page
```js
cmsRouter.onPageRender = function(pageFile, req, res, next){ res.end(pageFile); }
```

---

### onRedirect
`function(redirect, req, res, next){ }`

Function executed when a matching redirect has been found
```js
cmsRouter.onRedirect = function(redirect, req, res, next){ /* return false to not follow redirect */ }
```

---

## Public Methods

---

### getRouter
`<jsHarmonyCmsRouter>.getRouter(options)`

*Main Entry Point* - CMS Express.js Router Application
#### Parameters
* `options: (object)` *(Optional)* Options
   ```less
   {
      serveContent: (bool),
      //(Optional, default true) Whether the router should serve static content from config.content_path

      serveRedirects: (bool),
      //(Optional, default true) Whether the router should serve redirects

      servePages: (bool)
      //(Optional, default true) Whether the router should serve pages, based on the request URL

      serveCmsEditorScript: (bool)
      //(Optional, default true) Whether the router should serve the CMS Editor Launcher script at config.cms_clientjs_editor_launcher_path

      generate404OnNotfound: (bool)
      //(Optional, default false) Whether the router should generate a 404 page if no matching page was found
   }
   ```
#### Returns
`(function)` Express.js Route
#### Example
```js
app.use(cmsRouter.getRouter({ generate404OnNotfound: true }));
```

---

### getStandalone
`<jsHarmonyCmsRouter>.getStandalone(req, url)`

*Main Entry Point* - Load Standalone CMS Content
#### Parameters:
* `req: (object)` Express.js Request
* `url: (string)` *(Optional)* CMS Page URL

   Use Full URL, Root-relative URL, or leave blank to use current URL from Express.js Request
#### Returns
`(object)` Page Object, with additional properties: isInEditor, editorContent, notFound

If page is opened from CMS Editor or Not Found, an empty Page Object will be returned
```less
Page Object {
  seo: {
      title: (string),   //Title for HEAD tag
      keywords: (string),
      metadesc: (string),
      canonical_url: (string)
  },
  css: (string),
  js: (string),
  header: (string),
  footer: (string),
  title: (string),      //Title for Page Body Content
  content: {
      <content_area_name>: <content> (string)
  },
  properties: {
      <property_name>: <property_value>
  },
  isInEditor: (bool),     //Whether the page was opened from the CMS Editor
  editorScript: (string), //If page was opened from a CMS Editor in config.cms_server_urls, the HTML script to launch the Editor
  notFound: (bool)        //Whether the page was Not Found (page data will return empty)
}
```
#### Example
```js
app.get('/standalone_page', async function(req, res, next){
  var page = await cmsClient.getStandalone(req);
  res.render('standalone_page.ejs', { page: page });
});
```

---

### isInEditor
`<jsHarmonyCmsRouter>.isInEditor()`

Checks whether the page is in CMS Edit mode

#### Parameters
N/A

#### Returns
`(bool)` True if this page was opened from the CMS Editor

#### Example
```js
if(cmsRouter.isInEditor()){ console.log('Editor'); }
```

---

### resolve
`<jsHarmonyCmsRouter>.resolve(url, options)`

Converts URL to CMS Content Path
#### Parameters
* `url: (string)` CMS Page URL

   Use Full URL or Root-relative URL
* `options: (object)` *(Optional)* Options
   ```js
   {
      // Whether to try URL variations (adding "/", "/<default_document>")
      strictUrlResolution: (bool), 

      // Starting Variation ID
      variation: (int)
   }
   ```
#### Returns
`(string)` CMS Content Path
#### Example
```js
var contentPath = cmsRouter.resolve(targetUrl);
```

---

### route
`<jsHarmonyCmsRouter>.route(url)`

Run client-side CMS router on the target URL
#### Parameters
* `url: (string)` CMS Page URL

   Use Full URL or Root-relative URL
#### Returns
`(object)` Page, Redirect, or null if Not Found
```less
Page {
    type: 'page',
    content: (string) 'Page file content'
}

Redirect {
    type: 'redirect',
    redirect: {
        http_code: (string) '301', '302', or 'PASSTHRU',
        url: (string) 'destination/url'
    }
}
```
#### Example
```js
var routeDest = cmsRouter.route(targetUrl);
```


---

### getPageData
`<jsHarmonyCmsRouter>.getPageData(url, options)`

Get CMS Page Data
#### Parameters
* `url: (string)` CMS Page URL

   Use Full URL or Root-relative URL
* `options: (object)` *(Optional)* Options
   ```js
   {
      // Starting Variation ID
      variation: (int)
   }
   ```
#### Returns
`(object)` Page Object, or null if not found
```less
Page Object {
  seo: {
      title: (string),   //Title for HEAD tag
      keywords: (string),
      metadesc: (string),
      canonical_url: (string)
  },
  css: (string),
  js: (string),
  header: (string),
  footer: (string),
  title: (string),      //Title for Page Body Content
  content: {
      <content_area_name>: <content> (string)
  },
  properties: {
      <property_name>: <property_value>
  }
}
```
#### Example
```js
var pageData = cmsRouter.getPageData(targetUrl);
```

---

### getPageFile
`<jsHarmonyCmsRouter>.getPageFile(url, options)`

Get CMS Page File
#### Parameters
* `url: (string)` CMS Page URL

   Use Full URL or Root-relative URL
* `options: (object)` *(Optional)* Options
   ```js
   {
      // Starting Variation ID
      variation: (int)
   }
   ```
#### Returns
`(buffer)` Page Content

Error is thrown if page is not found
#### Example
```js
var pageFile = cmsRouter.getPageFile(targetUrl);
```

---

### getRedirectData
`<jsHarmonyCmsRouter>.getRedirectData()`

Get CMS Redirect Data

Requires `config.redirect_listing_path` to be defined
#### Returns
`Array(Redirect Object)` Redirects
```less
Redirect Object {
    http_code: (string) '301', '302', or 'PASSTHRU',
    url: (string) 'destination/url',
}
```
#### Example
```js
var cmsRedirects = cmsRouter.getRedirectData();
```

---

### getEditorScript
`<jsHarmonyCmsRouter>.getEditorScript(req)`

Generate script for CMS Editor
#### Parameters
* `req: (object)` Express.js Request
#### Returns
`(string)` HTML Code to launch the CMS Editor

If the page was not launched from the CMS Editor, an empty string will be returned

#### Security

The querystring jshcms_url parameter is validated against `config.cms_server_urls`

If the CMS Server is not found in `config.cms_server_urls`, an empty string will be returned
#### Example
```js
res.send(cmsRouter.getEditorScript(req));
```

---

### matchRedirect
`<jsHarmonyCmsRouter>.matchRedirect(redirects, url)`

Check if URL matches redirects and return first match
#### Parameters
* `redirects: Array(object)` Array of CMS Redirects (from getRedirectData function)
* `url: (string)` Target URL to match against the CMS Redirects

   Use Full URL or Root-relative URL
#### Returns
`(object)` Redirect
```less
Redirect Object {
  http_code: (string) '301', '302', or 'PASSTHRU',
  url: (string) '<destination url>'
}
```
#### Example
```js
var redirect = cmsRouter.matchRedirect(cmsRedirects);
if(redirect && (redirect.http_code=='301')){
  res.writeHead(301,{ 'Location': redirect.url });
  res.end();
}
```

---

### generate404
`<jsHarmonyCmsRouter>.generate404(req, res)`

Generate a 404 Not Found page in Express.js
#### Parameters
* `req: (object)` Express.js Request
* `res: (object)` Express.js Response

#### Example
```js
cmsRouter.generate404(req, res);
```

---

### generateError
`<jsHarmonyCmsRouter>.generate404(req, res, err)`

Generate a 404 Not Found page in Express.js
#### Parameters
* `req: (object)` Express.js Request
* `res: (object)` Express.js Response
* `err: (object|string)` Error object or string text

#### Example
```js
cmsRouter.generateError(req, res, 'An unexpected error has occurred.');
```

---

## *jsHarmonyCmsEditor Class*

* [Constructor](#jsharmonycmseditor-constructor)

---

## jsHarmonyCmsEditor Constructor

```js
jsHarmonyCmsEditor(config)
```

#### Arguments

- `config` (Object) :: Object with one or more of the configuration keys below:
```js
{
  access_keys: [],
  //Array(string) CMS Editor Access Keys, used to validate remote CMS URL
}
```

#### Example
```js
//Load the CMS Editor in this page
jsHarmonyCmsEditor({ access_keys: ['xxxxxxxxxxxxxxxxxxxxxx'] });
```
