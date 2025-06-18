module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		clean: {
			dist: ['dist']
		},

		copy: {
			main: {
				expand: true,
				flatten: true,
				src: 'src/headless.esm.js',
				dest: 'dist/',
			},
		},

		uglify: {
			options: {
				banner: '/*!\n * Canada.ca Search UI Connector / Connecteur IU de Recherche pour Canada.ca\n' +
				' * @license https://github.com/ServiceCanada/search-ui/?tab=MIT-1-ov-file\n' +
				' * v<%= pkg.version %> - ' + '<%= grunt.template.today("yyyy-mm-dd") %>\n*/'
			},

			dist: {
				files: {
					'dist/connector.min.js': ['src/connector.js']
				}
			}
		},

		cssmin: {
			dist: {
				files: {
					'dist/connector.min.css': ['src/connector.css']
				}
			}
		},

		usebanner: {
			taskName: {
				options: {
					position: 'top',
					banner: '/*!\n * Canada.ca Search UI Connector / Connecteur IU de Recherche pour Canada.ca\n' +
					' * @license https://github.com/ServiceCanada/search-ui/?tab=MIT-1-ov-file\n' +
					' * v<%= pkg.version %> - ' + '<%= grunt.template.today("yyyy-mm-dd") %>\n*/',
					linebreak: true
				},
				files: {
					src: [ 'dist/connector.min.css' ]
				}
			}
		},

		htmllint: {
			all: {
				src: ['*.html']
			},

			options: {
				"attr-name-style": "dash",
				"attr-quote-style": false,
				"id-class-style": "dash",
				"indent-style": "tabs",
				"indent-width": 4,
				"line-end-style": "lf",
				"attr-no-unsafe-char": false
			}
		},

		jshint: {
			all: {
				options: {
					esversion: 11,
					'-W067': true	// To ignore Unorthodox function invocation
				},
				src: ['Gruntfile.js', 'src/connector.js']
			}
		},

		eslint: {
			options: {
				overrideConfigFile: ".eslintrc.json",
				quiet: true
			},
			target: ['Gruntfile.js', 'src/connector.js']
		}
	});

	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-cssmin');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-banner');
	grunt.loadNpmTasks('grunt-htmllint');
	grunt.loadNpmTasks('grunt-eslint');

	// Task to fix line endings after minification
	grunt.registerTask('fixLineEndings', function () {
		let content = grunt.file.read('dist/connector.min.css');
		content = content.replace(/\r\n?/g, '\n');
		grunt.file.write('dist/connector.min.css', content);
	});

	grunt.registerTask('default', ['clean', 'htmllint', 'jshint', 'eslint', 'copy', 'uglify', 'cssmin', 'usebanner', 'fixLineEndings']);
};
