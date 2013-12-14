/*
 * SPDY Proxy by Patrizio Tufarolo
 */
var net = require('net'),
    http = require('http'),
    fs = require('fs'),
    url = require('url');

function plainHandler(req,res,host,path,port) {
    var options = {
        'host':host,
        'port':port,
        'method': req.method,
        'agent':req.agent,
        'path':path,
        'headers':req.headers
    };
    
    var proxyRequest = http.request(options,
        function (proxyResponse) {
            res.writeHead(proxyResponse.statusCode,proxyResponse.headers);
            proxyResponse.pipe(res);
            res.pipe(proxyResponse);
        }
    );
    
    proxyRequest.on('error',function(error) { res.writeHead(200); res.write("<h1>500 error</h1><p>" + error + "</p>"); res.end(); });
    req.pipe(proxyRequest);
    res.on('close', function() {
      proxyRequest.abort();
    });
}

function spdyHandler(req,res,host,path,port) {
    var options = {
      host: host,
      port: port,
    };

    var tunnel = net.createConnection(options, function() {
      synReply(res, 200, 'Connection established',
        {
          'Connection': 'keep-alive',
          'Proxy-Agent': 'PattPatel SPDY Proxy'
        },
        function() {
          tunnel.pipe(socket);
          socket.pipe(tunnel);
        }
      );
    });

    tunnel.setNoDelay(true);

    tunnel.on('error', function(e) {
      console.log("SPDY Tunnel error: ".red + e);
      synReply(socket, 500, "SPDY Tunnel Error", {}, function() {
        socket.end();
      });
    });
}


  function synReply(socket, code, reason, headers, callback) {
    try {
      if(socket._lock){
        socket._lock(function() {
          var socket = this;
          this._spdyState.framer.replyFrame(this._spdyState.id, code, reason, headers,
            function (err, frame) {
              socket.connection.write(frame);
              socket._unlock();
              callback.call();
            }
          );
        });

      } else {
        var statusLine = 'HTTP/1.1 ' + code + ' ' + reason + '\r\n';
        var headerLines = '';
        for(head in headers){
            headerLines += head + ': ' + headers[head] + '\r\n';
        }
        socket.write(statusLine + headerLines + '\r\n', 'UTF-8', callback);
      }
    } catch(error) {
      callback.call();
    }
  }

function requestHandler(req,res,host,port) {
    var path = req.headers.path || url.parse(req.url).path;
    req.method == 'CONNECT' ? spdyHandler(req, res, host, port) : plainHandler(req, res, host, path, port);  
}

// Functions which will be available to external callers
exports.requestHandler = requestHandler;
