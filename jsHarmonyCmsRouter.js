/*!
Copyright 2021 apHarmony

This file is part of jsHarmony.

jsHarmony is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

jsHarmony is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this package.  If not, see <http://www.gnu.org/licenses/>.
*/

var URL = require('url');
var fs = require('fs');
var path = require('path');
var ServeStatic = require('serve-static');

function jsHarmonyCmsRouter(config){
  var _this = this;

  //==========
  //Parameters
  //==========
  config = extend({
    content_path: '.',              //(string) File path to published CMS content files
    redirect_listing_path: null,    //(string) Path to redirect listing JSON file (relative to content_path)
    default_document: 'index.html', //(string) Default Directory Document
    strict_url_resolution: false,   //(bool) Whether to support URL variations (appending "/" or Default Document)
    passthru_timeout: 30,           //(int) Maximum number of seconds for passthru request
    cms_clientjs_editor_launcher_path: '/.jsHarmonyCms/jsHarmonyCmsEditor.js', //(string) Path where router will serve the client-side JS script that launches CMS Editor
    cms_server_urls: [],            //Array(string) The CMS Server URLs that will be enabled for Page Editing (set to '*' to enable any remote CMS)
                                    //  * Used by page.editorScript, and the getEditorScript function
                                    //  * NOT used by jsHarmonyCmsEditor.js - the launcher instead uses access_keys for validating the remote CMS
  }, config);

  //=================
  //Public Properties
  //=================
  this.onError = function(err, req, res, next){ console.error('-------------------------\nError loading '+req.url); console.error(err); _this.generateError(req, res, 'An unexpected error has occurred.  Please see system log for more details.'); };  //function(err, req, res, next){ }
  this.onPageRender = function(pageFile, req, res, next){ res.end(pageFile); } //function(page, req, res, next){ }
  this.onRedirect = function(redirect, req, res, next){ /* return false to stop further processing */ } //function(redirect, req, res, next){ }

  //=================
  //Private Properties
  //=================
  extend(this, config);
  if(!_this.content_path) throw new Error('CMS Configuration Error - content_path parameter is required');

  //================
  //Public Functions
  //================

  //getRouter [Main Entry Point] - CMS Express.js Router Application
  //Parameters:
  //  options: (object) {
  //      serveContent:   (bool) Whether the router should serve static content from config.content_path
  //      serveRedirects: (bool) Whether the router should serve redirects
  //      servePages:     (bool) Whether the router should serve pages, based on the request URL
  //      serveCmsEditorScript:  (bool) Whether the router should serve the CMS Editor Launcher script at config.cms_clientjs_editor_launcher_path
  //      generate404OnNotFound: (bool) Whether the router should generate a 404 page if no matching page was found
  //  }
  //Returns (function) Express.js Route
  this.getRouter = function(options){
    options = extend({
      serveContent: true,
      serveRedirects: true,
      servePages: true,
      serveCmsEditorScript: true,
      generate404OnNotFound: false,
    }, options);
    if(!_this.content_path) return _this.onError(new Error('CMS Configuration Error - content_path parameter is required'), req, res, next);
    var staticRouter = (options.serveContent ? ServeStatic(_this.content_path) : function(req, res, next){ return next(); });
    return async function(req, res, next){
      staticRouter(req, res, async function(){
        try{
          if(options.serveCmsEditorScript){
            if(req.url==_this.cms_clientjs_editor_launcher_path){
              return await _this.serveFile(res, path.join(__dirname, 'clientjs/jsHarmonyCmsEditor.min.js'));
            }
          }
          if(options.serveRedirects){
            var redirects = await _this.getRedirectData();
            var redirect = _this.matchRedirect(redirects, req.url);
            if(redirect){
              if(_this.onRedirect(redirect, req, res, next)===false) return;
              var http_code = (redirect.http_code||'').toString();
              if(http_code=='301'){ return _this.redirect301(res, redirect.url); }
              else if(http_code=='302'){ return _this.redirect302(res, redirect.url); }
              else if(http_code=='PASSTHRU'){
                var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
                var passthruUrl = new URL.URL(redirect.url, fullUrl).toString();
                return await _this.passthruRequest(passthruUrl, res);
              }
              else throw new Error('Invalid redirect HTTP code: '+http_code);
            }
          }
          if(options.servePages){
            pageFile = await _this.getPageFile(req.url);
            _this.onPageRender(pageFile, req, res, next);
            return;
          }
        }
        catch(ex){
          if(ex.name=='PageNotFoundError'){ /* 404 */ }
          else return _this.onError(ex, req, res, next);
        }
        if(options.generate404OnNotFound) return _this.generate404(req, res, next);
        else if(next) return next();
      });
    }
  }

  //getStandalone [Main Entry Point] - Get CMS Page Data for Standalone Integration
  //Parameters:
  //  req: (object) Express.js Request
  //  url: (string) Page URL
  //         Use Full URL, Root-relative URL, or leave blank to use current URL from Request
  //Returns (object) Page Object, with additional properties: isInEditor, editorContent, notFound
  //                 * if page is opened from CMS Editor or Not Found, an empty Page Object will be returned
  //Page Object {
  //  seo: {
  //      title (string),   //Title for HEAD tag
  //      keywords (string),
  //      metadesc (string),
  //      canonical_url (string)
  //  },
  //  css (string),
  //  js (string),
  //  header (string),
  //  footer (string),
  //  title (string),      //Title for Page Body Content
  //  content: {
  //      <content_area_name>: <content> (string)
  //  }
  //  properties: {
  //      <property_name>: <property_value>
  //  }
  //  page_template_id (string),
  //  isInEditor (bool),     //Whether the page was opened from the CMS Editor
  //  editorScript (string), //If page was opened from a CMS Editor in config.cms_server_urls, the HTML script to launch the Editor
  //  notFound (bool)        //Whether the page was Not Found (page data will return empty)
  //}
  this.getStandalone = async function(req, url){
    var pageData = {};
    if(!_this.isInEditor(req)){
      pageData = await _this.getPageData(url || req.url);
    }
    if(!pageData) pageData = { notFound: true };
    if(!pageData.content) pageData.content = {};
    if(!pageData.properties) pageData.properties = {};
    if(!pageData.seo) pageData.seo = {};
    pageData.isInEditor = _this.isInEditor(req);
    if(pageData.isInEditor){
      pageData.editorScript = _this.getEditorScript(req);
    }
    return pageData;
  }

  //isInEditor - Check whether page is currently in CMS Editing Mode
  //Returns (bool) True if page is opened from CMS Editor
  this.isInEditor = function(req){
    var _GET = (req && req.query) || {};
    return !!_GET.jshcms_token;
  }

  //resolve - Convert URL to CMS Content Path
  //Parameters:
  //  url: (string) CMS Page URL
  //         Use Full URL or Root-relative URL
  //  options: (object) { strictUrlResolution: (bool), variation: (int) }
  //Returns (string) Resolved URL for target variation
  this.resolve = function(url, options){
    options = _this.extend({
      strictUrlResolution: _this.strict_url_resolution,
      variation: 1,
    }, options);

    if(!url) url = '';
    //If URL is not absolute, add starting "/"
    if(url.indexOf('//')<0){
      if(url.indexOf('/') != 0){
        if(url.indexOf('\\')==0) url = url.substr(1);
        url = '/' + url;
      }
    }
    //Extract path
    url = URL.parse(url);
    var urlpath = url.pathname;
    if(!urlpath || (urlpath[0] != '/')) urlpath = '/' + urlpath;
    //Add url prefix
    url = path.join(_this.content_path, urlpath);
    if(!options.strictUrlResolution){
      //Add trailing slash and "/index.html", if applicable
      if(url && ((url[url.length-1]=='/')||(url[url.length-1]=='\\'))){
        url = path.join(url, _this.default_document);
      }
      if(options.variation==1){ /* Do nothing */ }
      if(options.variation==2){
        var url_ext = _this.getExtension(url);
        var default_ext = _this.getExtension(_this.default_document);
        if(url_ext && default_ext && (url_ext == default_ext)) options.variation += 1;
        else {
          url = path.join(url, _this.default_document);
        }
      }
      if(options.variation>=3) throw new PageNotFoundError(urlpath);
    }
    else if(options.variation>=2) throw new PageNotFoundError(urlpath);
    return url;
  }

  //route - Check URL against Page and Redirect routes
  //Parameters:
  //  url: (string) CMS Page URL
  //         Use Full URL or Root-relative URL
  // Returns (object) Page, Redirect, or null if Not Found
  // Page {
  //     type: 'page',
  //     content: (string) 'Page file content'
  // }
  // Redirect {
  //     type: 'redirect',
  //     redirect: {
  //         http_code: (string) '301', '302', or 'PASSTHRU',
  //         url: (string) 'destination/url'
  //     }
  // }
  this.route = async function(url){
    try{
      var redirects = await _this.getRedirectData();
      var redirect = _this.matchRedirect(redirects, url);
      if(redirect){
        return { type: 'redirect', redirect: redirect };
      }
      var pageFile = await _this.getPageFile(url);
      return { type: 'page', content: pageFile };
    }
    catch(ex){
      if(ex.name=='PageNotFoundError'){ /* 404 */ }
      else throw ex;
    }
    return null;
  }

  //getPageData - Get CMS Page Data
  //Parameters:
  //  url: (string) Page URL
  //         Use Full URL, Root-relative URL
  //  options: (object) { variation: (int) }
  //Returns (object) Page Object, or null if not found
  //Page Object {
  //  seo: {
  //      title (string),   //Title for HEAD tag
  //      keywords (string),
  //      metadesc (string),
  //      canonical_url (string)
  //  },
  //  css (string),
  //  js (string),
  //  header (string),
  //  footer (string),
  //  title (string),      //Title for Page Body Content
  //  content: {
  //      <content_area_name>: <content> (string)
  //  },
  //  properties: {
  //      <property_name>: <property_value>
  //  },
  //  page_template_id (string)
  //}
  this.getPageData = async function(url, options){
    options = _this.extend({
      variation: 1,
    }, options);

    var pageData = null;
    try{
      var pageFile = await _this.getPageFile(url, options);
      var pageData = JSON.parse(pageFile);
    }
    catch(ex){
    }
    if(!pageData) return pageData;
    if(!pageData.content) pageData.content = {};
    if(!pageData.properties) pageData.properties = {};
    if(!pageData.seo) pageData.seo = {};
    return pageData;
  }

  //getPageFile - Get CMS Page File Content
  //Parameters:
  //  url: (string) Page URL
  //         Use Full URL, Root-relative URL
  //  options: (object) { variation: (int) }
  //Returns (string) Page Content
  this.getPageFile = async function(url, options){
    options = _this.extend({
      variation: 1,
    }, options);

    var contentPath = _this.resolve(url, options);
    var content = null;
    try{
      content = await _this.getFile(contentPath);
    }
    catch(ex){
      if((ex.code=='ENOENT')||(ex.code=='EISDIR')){
        options.variation++;
        return _this.getPageFile(url, options);
      }
      throw ex;
    }
    return content;
  }

  //getRedirectData - Get CMS Redirect Data
  //Returns Array(object) Redirects
  //Redirect Object {
  //    http_code: (string) '301', '302', or 'PASSTHRU',
  //    url: (string) 'destination/url',
  //}
  this.getRedirectData = async function(){
    var redirect_listing_path = _this.redirect_listing_path;
    if(!redirect_listing_path) return null;
    if(!path.isAbsolute(redirect_listing_path)){
      redirect_listing_path = path.join(_this.content_path, redirect_listing_path);
    }
    return await _this.getJsonFile(redirect_listing_path);
  }

  //getEditorScript - Generate script for CMS Editor
  //Parameters:
  //  req: (object) Express.js Request
  //Returns (string) HTML Code to launch the CMS Editor
  //  * If the page was not launched from the CMS Editor, an empty string will be returned
  //  * The querystring jshcms_url parameter is validated against config.cms_server_urls
  //  * If the CMS Server is not found in config.cms_server_urls, an empty string will be returned
  this.getEditorScript = function(req){
    var _GET = (req && req.query) || {};
    if(!_GET.jshcms_token) return '';
    if(!_GET.jshcms_url) return '';
    //Validate URL
    var cms_server_url = _GET.jshcms_url;
    if(!Array.isArray(_this.cms_server_urls)) _this.cms_server_urls = [_this.cms_server_urls];
    var foundMatch = false;
    var curUrl = URL.parse(cms_server_url);
    for(var i=0;i<_this.cms_server_urls.length;i++){
      var testUrl = (_this.cms_server_urls[i]||'').toString();
      if(!testUrl) continue;
      if(testUrl=='*'){ foundMatch = true; break; }
      try{
        var parsedUrl = URL.parse(testUrl);
        var strEqual = function(a,b){ return (a||'').toString().toLowerCase() == (b||'').toString().toLowerCase(); }
        var strPortEqual = function(a,b,protocolA,protocolB){
          if(!a && (protocolA=='https:')) a = 443;
          if(!b && (protocolB=='https:')) b = 443;
          if(!a && (protocolA=='http:')) a = 80;
          if(!b && (protocolB=='http:')) b = 80;
          return strEqual(a,b);
        }
        if(parsedUrl.protocol && !strEqual(curUrl.protocol, parsedUrl.protocol)) continue;
        if(!strEqual(curUrl.hostname, parsedUrl.hostname)) continue;
        if(!strPortEqual(curUrl.port, parsedUrl.port, curUrl.protocol, parsedUrl.protocol||curUrl.protocol)) continue;
        var parsedPath = parsedUrl.pathname || '/';
        var curPath = curUrl.pathname || '/';
        if(curPath.indexOf(parsedPath)===0){ foundMatch = true; break; }
      }
      catch(ex){
      }
    }
    if(!foundMatch) return '';
    return '<script type="text/javascript" src="'+_this.escapeHTMLAttr(_this.joinUrlPath(cms_server_url,'/js/jsHarmonyCMS.js'))+'"></script>';
  }

  //matchRedirect - Check if URL matches redirects and return first match
  //Parameters:
  //  redirects: Array(object) Array of CMS Redirects
  //  url: (string) Target URL
  //         Use Full URL or Root-relative URL
  //Returns: (object) Redirect Object
  //Redirect Object {
  //  http_code: '301', '302', or 'PASSTHRU',
  //  url: 'destination/url',
  //}
  this.matchRedirect = function(redirects, url){
    if(!url) url = '';
    //If URL is not absolute, add starting "/"
    if(url.indexOf('//')<0){
      if(url.indexOf('/') != 0){
        if(url.indexOf('\\')==0) url = url.substr(1);
        url = '/' + url;
      }
    }
    //Extract path
    url = URL.parse(url);
    var urlpath = url.pathname;
    if(!urlpath || (urlpath[0] != '/')) urlpath = '/' + urlpath;

    if(redirects && redirects.length){
      for(var i=0;i<redirects.length;i++){
        var redirect = redirects[i];
        if(!redirect) continue;
        var cmpurlpath = (redirect.redirect_url||'').toString();
        var desturl = (redirect.redirect_dest||'').toString();
        if(redirect.redirect_url_type=='EXACT'){
          if(urlpath != cmpurlpath) continue;
        }
        else if(redirect.redirect_url_type=='EXACTICASE'){
          if(urlpath.toLowerCase() != cmpurlpath.toLowerCase()) continue;
        }
        else if((redirect.redirect_url_type=='BEGINS')||(redirect.redirect_url_type=='BEGINSICASE')){
          if(!_this.beginsWith(urlpath, cmpurlpath, (redirect.redirect_url_type=='BEGINSICASE'))) continue;
        }
        else if((redirect.redirect_url_type=='REGEX')||(redirect.redirect_url_type=='REGEXICASE')){
          var rxMatch = urlpath.match(new RegExp(cmpurlpath,((redirect.redirect_url_type=='REGEXICASE')?'i':'')));
          if(!rxMatch) continue;
          for(var j=rxMatch.length;j>=1;j--){
            desturl = _this.replaceAll(desturl, '$'+j.toString(), rxMatch[j]);
          }
        }
        return {
          http_code: redirect.redirect_http_code,
          url: desturl,
        };
      }
    }
    return undefined;
  }

  //generate404 - Generate Express.js 404 Not Found Page
  //Parameters:
  //  req: (object) Express.js Request
  //  res: (object) Express.js Response
  this.generate404 = function(req, res){
    res.status(404);
    res.end(_this.renderPageText('404 - Not Found', 'Not Found', 'The requested page was not found on this server.'));
  }

  //generateError - Generate Express.js 500 Error Page
  //Parameters:
  //  req: (object) Express.js Request
  //  res: (object) Express.js Response
  //  err: (object|string) Error object or string text
  this.generateError = function(req, res, err){
    res.status(500);
    res.end(_this.renderPageText('System Error', 'System Error', err.toString()));
  }

  //==================
  //Internal Functions
  //==================

  //CMS Helper Functions
  //--------------------

  function PageNotFoundError(url){
    var instance = new Error('Page not found: '+url);
    instance.name='PageNotFoundError';
    return instance;
  }
  PageNotFoundError.prototype = Object.create(Error.prototype, { constructor: { value: Error, enumerable: false, writable: true, configurable: true } });

  _this.redirect301 = function(res, url){
    res.writeHead(301,{ 'Location': url });
    res.end();
  };

  _this.redirect302 = function(res, url){
    res.writeHead(302,{ 'Location': url });
    res.end();
  };

  _this.passthruRequest = function(url, res){
    return new Promise(function(resolve, reject){
      try{
        var urlparts = URL.parse(url);
        var browser = null;
        var protocol = (urlparts.protocol||'').toLowerCase();
        if(protocol=='http:') browser = require('http');
        else if(protocol=='https:') browser = require('https');
        else throw new Error('Unsupported PASSTHRU protocol: '+protocol);
        var browserReqOptions = {
          host: urlparts.hostname,
          port: urlparts.port,
          path: urlparts.path,
          auth: urlparts.auth||null,
          method: 'get',
          timeout: _this.passthru_timeout * 1000,
        };
        if (browserReqOptions.host == 'localhost') browserReqOptions.rejectUnauthorized = false;
        var browserReqIsComplete = false;
        var browserReq = browser.request(browserReqOptions, function(browserRes){
          browserRes.setEncoding('utf8');
          res.status(browserRes.statusCode);
          if(browserRes.headers) for(var key in browserRes.headers){
            var headerName = key.toLowerCase();
            var headerVal = browserRes.headers[key];
            if(headerName=='location'){
              if((browserRes.statusCode >= 300) && (browserRes.statusCode < 400)){
                res.set('Location', headerVal);
                res.end();
                return;
              }
            }
            else if(headerName=='content-type') res.set('Content-Type', headerVal);
          }
          var rslt = '';
          browserRes.on('data', function (chunk) { rslt += chunk; });
          browserRes.on('end', function () {
            if (browserReqIsComplete) return;
            browserReqIsComplete = true;
            return res.end(rslt);
          });

        });
        browserReq.on('error', function (err) {
          if (browserReqIsComplete) return;
          browserReqIsComplete = true;
          return reject(err);
        });
        browserReq.end()
      }
      catch(ex){
        return reject(ex);
      }
    });
  }

  this.getJsonFile = async function(filePath){
    var content = await _this.getFile(filePath);
    return JSON.parse(content);
  }

  this.getFile = async function(filePath){
    return await fs.promises.readFile(filePath);
  }

  this.serveFile = async function(res, filePath){
    var content = await _this.getFile(filePath);
    res.end(content);
  }

  this.renderPageText = function(pageTitle, bodyTitle, bodyText){
    return _this.renderPage(pageTitle, bodyTitle, _this.escapeHTML(bodyText));
  }

  this.renderPage = function(pageTitle, bodyTitle, body){
    return [
      '<!DOCTYPE HTML><html>',
      '<head>',
      '<meta charset="utf-8"/>',
      '<title>'+_this.escapeHTML(pageTitle)+'</title>',
      '<style>body { font-family: sans-serif; }</style>',
      '</head>',
      '<body>',
      '<h1>'+_this.escapeHTML(bodyTitle)+'</h1>',
      body,
      '</body>',
      '</html>'
    ].join('');
  }

  //Utility - Path
  //--------------

  this.getExtension = function(path){
    if(!path) return '';
    var lastSlash = 0;
    for(var i=path.length-1;i>=0;i--){
      if((path[i]=='/')||(path[i]=='\\')){ lastSlash = i+1; break; }
    }
    path = path.substr(lastSlash);
    if(!path) return '';
    var lastDot = path.lastIndexOf('.');
    if(lastDot >= 0) path = path.substr(lastDot);
    return path;
  }

  //Utility - JS Extensions
  //-----------------------

  function extend(dst, src){
    if(src){
      for(var key in src) dst[key] = src[key];
    }
    return dst;
  }
  this.extend = extend;

  this.contains = function(arr, val){
    if(!arr) return false;
    for(var i=0;i<arr.length;i++){
      if(arr[i]==val) return true;
    }
    return false;
  }

  this.map = function(arr, f){
    var rslt = [];
    for(var i=0;i<arr.length;i++){
      rslt.push(f(arr[i]));
    }
    return rslt;
  }

  this.endsWith = function (str, suffix, caseInsensitive) { if(caseInsensitive){ str = (str||'').toLowerCase(); suffix = (suffix||'').toLowerCase(); } return (str||'').toString().match(suffix + "$") == suffix; }

  this.beginsWith = function (str, prefix, caseInsensitive) { if(caseInsensitive){ str = (str||'').toLowerCase(); prefix = (prefix||'').toLowerCase(); } return (str||'').toString().indexOf(prefix) === 0; }

  this.replaceAll = function (val, find, replace) { return val.split(find).join(replace); }

  this.joinUrlPath = function(a,b){
    if(!a) return b||'';
    if(!b) return a||'';
    var aEnd = a[a.length-1];
    var bStart = b[0];
    while(a.length && ((aEnd=='/')||(aEnd=='\\'))){ a = a.substr(0,a.length-1); if(a.length) aEnd=a[a.length-1]; }
    while(b.length && ((bStart=='/')||(bStart=='\\'))){ b = b.substr(1); if(b.length) bStart=b[0]; }
    return a + '/' + b;
  }

  this.escapeHTML = function (val) {
    var entityMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': '&quot;',
      "'": '&#39;',
      "/": '&#x2F;',
      '\u00A0':'&#xa0;'
    };
    
    return String(val).replace(/[\u00A0&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  this.escapeHTMLAttr = function (val) {
    var entityMap = {
      '"': '&quot;',
      "'": '&#39;',
    };
    
    return String(val).replace(/["']/g, function (s) {
      return entityMap[s];
    });
  }

}

module.exports = exports = {
  Router: jsHarmonyCmsRouter
};