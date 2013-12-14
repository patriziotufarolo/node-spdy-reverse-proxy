var	http			=	require('http')
,	spdy			=	require('spdy')
,	fs 				=	require('fs')
,	crypto			=	require('crypto')
,	connect 		=	require('connect')
,	proxy			=	require(__dirname + '/proxy_spdy')


,	cert_contexts	=	{}
,	http_vhosts		=	{}
,	spdy_vhosts		=	{}
,	daemon_status	=	0;


if(!fs.existsSync(__dirname + '/config.json')) {
	console.log("Please create the default configuration file");
	process.exit(1);
}
var default_config = require(__dirname + '/config.json');

function downscaleProcess() {
    if (daemon_status == 0) {
            daemon_status++;
    }
    else if (daemon_status == 1) {
        /* Uncomment these lines to downscale the node process to the specified user id */
        //process.setgid(1003);
        //process.setuid(1003);
    }
}


function getCertContext(key,cert,ca) {
	return crypto.createCredentials({
		key: fs.readFileSync(key),
		cert: fs.readFileSync(cert),
		ca: fs.readFileSync(ca)
	}).context;
}

function cloneObject(obj) {
    if (obj === null || typeof obj !== 'object') { return obj; }
    var temp = obj.constructor();
    for (var key in obj) {
        temp[key] = cloneObject(obj[key]);
    }
    return temp;
}


fs.readdirSync(__dirname + "/config").forEach(function(file) {
	if (file.lastIndexOf('.json') == (file.length-5)) {
		var config = require(__dirname + "/config/" + file);

		if (config.spdy == true) {
			if (typeof(config.certificate.key) === 'undefined') {
				console.log("missing certificate.key property in file " + file +", using default");
				if (typeof(default_config.certificate.key) === 'undefined') {
					console.log("missing default certificate.key property too, skipping vhost");
					return false;
				}
				config.certificate.key = default_config.certificate.key;
			}

			if (typeof(config.certificate.cert) === 'undefined') {
				console.log("missing certificate.cert property in file " + file +", using default");
				if (typeof(default_config.certificate.cert) === 'undefined') {
					console.log("missing default certificate.cert property too, skipping vhost");
					return false;
				}
				config.certificate.key = default_config.certificate.key;
			}

			if (typeof(config.certificate.ca) === 'undefined') {
				console.log("missing certificate.ca property in file " + file +", using default");
				if (typeof(default_config.certificate.ca) === 'undefined') {
					console.log("missing default certificate.ca property too, skipping vhost");
					return false;
				}
				config.certificate.ca = default_config.certificate.ca;
			}

			cert_contexts[file] = getCertContext(config.certificate.key,config.certificate.cert,config.certificate.ca);
		}

		if (typeof(config.http) === 'undefined') {
			console.log("missing http property in file " + file +", using default");
			if (typeof(default_config.http) === 'undefined') {
				console.log("missing default http property too, skipping vhost");
				return false;
			}
			config.http = default_config.http;
		}

		if (typeof(config.spdy) === 'undefined') {
			console.log("missing spdy property in file " + file +", using default");
			if (typeof(default_config.spdy) === 'undefined') {
				console.log("missing default spdy property too, skipping vhost");
				return false;
			}
			config.spdy = default_config.spdy;
		}

		if (typeof(config.force_https) === 'undefined') {
			console.log("missing force_https property in file " + file +", using default");
			if (typeof(default_config.force_https) === 'undefined') {
				console.log("missing default force_https property too, skipping vhost");
				return false;
			}
			config.force_https = default_config.force_https;
		}
		if (typeof(config.hostnames) === "undefined") {
			console.log("no hostname defined in " + file + ", skipping vhost");
			return false;
		}
		if (typeof(config.app) === "undefined") {
			console.log("no app defined in " + file + ", skipping vhost");
			return false;
		}
		else if (typeof(config.app.address) === "undefined") {
			console.log("no app address defined in " + file + ", using 127.0.0.1");
			config.app.address = "127.0.0.1";
		}
		else if (typeof(config.app.port) === "undefined") {
			console.log("no port defined, skipping vhost");
			return false;
		}
		config.hostnames.forEach(function (hostname) {
			config.app.filename = file;
			if (config.http) {
				http_vhosts[hostname] = cloneObject(config.app);
				http_vhosts[hostname].force_https = config.force_https;
			}
			if (config.spdy) {
				spdy_vhosts[hostname] = cloneObject(config.app);
			}
		});


	}
});

http_middleware = new connect();
spdy_middleware = new connect();

function get_vhost(host,mode) {
	return connect.vhost(host,function(req,res) {
		if (mode == "http") {
			var vhosts = http_vhosts;
		}
		else if (mode == "spdy") {
			var vhosts = spdy_vhosts;
		}
	});
}

for (var host in http_vhosts) {
	http_middleware.use(get_vhost(host,"http"));
}
for (var host in spdy_vhosts) {
	spdy_middleware.use(get_vhost(host,"spdy"));
}
spdy_middleware.use(function(req,res) {
        res.end("Welcome to Node.JS SPDY Reverse Proxy :)");
});
spdy_server = spdy.createServer({
		SNICallback: function (hostname) {
			try {
				if (spdy_vhosts[hostname]) {
					return cert_contexts[spdy_vhosts[hostname].filename];
				}
				else {
					return getCertContext(default_config.certificate.key,default_config.certificate.crt,default_config.certificate.ca);
				}
			}
			catch (e) {
				console.log(e);
				return false;
			}
		},
			key: fs.readFileSync(default_config.certificate.key),
			cert: fs.readFileSync(default_config.certificate.cert),
			ca: fs.readFileSync(default_config.certificate.ca)
},spdy_middleware);

spdy_server.on('connect',function(req,res) {
	var host = req.headers.host.split(":")[0];
	if (spdy_vhosts[host] && (spdy_vhosts[host].address && spdy_vhosts[host].port)) {
		proxy.requestHandler(req,res,spdy_vhosts[host].address,spdy_vhosts[host].port);
	}
});

spdy_server.on('request',function(req,res) {
	var host = req.headers.host.split(":")[0];
	if (spdy_vhosts[host] && (spdy_vhosts[host].address && spdy_vhosts[host].port)) {
		proxy.requestHandler(req,res,spdy_vhosts[host].address,spdy_vhosts[host].port);
	}
});

spdy_server.listen(443, downscaleProcess); 
http_server = http.createServer(function(req,res) {
	try {
		var current_host = http_vhosts[req.headers.host] || http_vhosts[req.headers.host.substring(4)];
		if (current_host) {
			if (current_host.force_https && !req.secure) {
				res.writeHead(301, {Location: 'https://'+req.headers.host+req.url});
				res.end();
			}
			else {
				http_middleware(req,res);
			}
		}
		else {
			res.end("Welcome to Node.JS SPDY Reverse Proxy :)");
			return false;
		}
	}
	catch(e) {
		console.log(e);
		return false;
	}
}).listen(80,downscaleProcess);
