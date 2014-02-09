import java.io.File;

public class Copier {
	
	private final String INPUT_PATH;
	private final String OUTPUT_PATH;
	private final String[] EXCLUDE_DIRS;
	
	public Copier(String inputPath, String outputPath, String[] excludeDirs) {
		this.INPUT_PATH = inputPath;
		this.OUTPUT_PATH = outputPath;
		
		for(int i = 0; i < excludeDirs.length; i++) {
			excludeDirs[i] = (INPUT_PATH + '/' + excludeDirs[i]).replace('/', '\\');
		}
		this.EXCLUDE_DIRS = excludeDirs;
	}
	
	public boolean isExcluded(String dirPath) {
		for(int i = 0; i < EXCLUDE_DIRS.length; i++) {
			if(EXCLUDE_DIRS[i].equals(dirPath)) {
				return true;
			}
		}
		return false;
	}
	
	public void copy() {
		for(int i =0; i < EXCLUDE_DIRS.length; i++) {
			System.out.println("Excluding: " + EXCLUDE_DIRS[i]);
		}
		copy(INPUT_PATH);
	}
	
	// recursive
	private void copy(String dirPath) {
		
		File input = new File(dirPath);
		if(! isExcluded(dirPath)) {
			if(! input.isDirectory()) {
				System.out.println("Copying: " + input.getPath());
				//TODO copy
			} else {
				for(File file : input.listFiles()) {
					if (! file.isDirectory()) {
						System.out.println("Copying: " + file.getPath());
						//TODO copy refactor
					} else {
						copy(file.getPath());
					}
				}
			}
		}
	}
	
}
