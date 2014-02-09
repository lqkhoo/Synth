import java.io.File;
import java.util.HashMap;

/**
 * 
 * Web deployment tool. Copies static assets to output,
 * minifies js sources, then concatenates
 * libraries with the minified sources to give one js file.
 * 
 */
public class Builder {
	
	private static final String INPUT_PATH = "web/dev";
	private static final String OUTPUT_PATH = "web/deploy";
	
	private static String htmlPath;
		
	// Directory for source files
	private static String[] sourceDir;
	
	private static HashMap<String, String> externMap;
	
	public static void main(String[] args) {
		
		String[] excludeCopy = new String[] {
			"js",
			"test",
			"test.html",
			"index.html"	// copy html, change head scripts manually
		};
		Copier copier = new Copier(INPUT_PATH, OUTPUT_PATH, excludeCopy);
		copier.copy();
		
		String[] concatSources = new String[] {
			"Backbone.CollectionBinder.min.js",
			"Backbone.ModelBinder.min.js",
			"backbone-min.js",
			"bootstrap.min.js",
			"jquery-2.0.3.min.js",
			"music.js",
			"timbre.min.js",
			"underscore-min.js"
		};
		
		/*
		String compiledCode = compile("function hello(name) {"
				+ "alert('Hello, ' + name);" + "}" + "hello('New user');");
		System.out.println(compiledCode);
		*/
		System.exit(0);
	}
	
	


}
