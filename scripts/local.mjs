import {setup,start,stop,paths} from './local-runtime.mjs';
import {backupLocal} from './local-backup.mjs';
const [command,...args]=process.argv.slice(2);
const value=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
try{
 if(command==='setup'){const p=await setup({fresh:args.includes('--fresh'),archive:value('--config-archive'),shortcuts:!args.includes('--no-shortcuts')});console.log('Local profile prepared:',p.home);}
 else if(command==='start'){const result=await start({browser:!args.includes('--no-browser'),queue:!args.includes('--paused')});console.log(result.reused?'Existing local backend reused.':'Local backend started at http://127.0.0.1:3001');}
 else if(command==='stop'){console.log((await stop()).stopped?'Local backend stopped.':'Local backend is already stopped.');}
 else if(command==='backup'){console.log('Verified local backup:',await backupLocal(paths()));}
 else throw new Error('Use: node scripts/local.mjs setup --fresh | start | stop | backup');
}catch(error){console.error(error.message);process.exitCode=1;}
